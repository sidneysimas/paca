package plugin

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	plugindom "github.com/Paca-AI/api/internal/domain/plugin"
)

const testPluginName = "test.poison"

var (
	poisonWasmOnce sync.Once
	poisonWasmPath string
	poisonWasmErr  error
)

// buildPoisonFixture compiles testdata/poisonplugin into a WASI-reactor wasm
// binary the first time it's needed, then reuses the result for the rest of
// the test binary's run. The compiled binary isn't committed to the repo
// (the project's .gitignore excludes *.wasm everywhere), so it's built here
// on demand with the standard Go toolchain: GOOS=wasip1 GOARCH=wasm
// cross-compilation needs nothing beyond the Go distribution already
// required to run these tests.
func buildPoisonFixture(t *testing.T) string {
	t.Helper()
	poisonWasmOnce.Do(func() {
		dir, err := os.MkdirTemp("", "poisonplugin-*")
		if err != nil {
			poisonWasmErr = err
			return
		}
		wd, err := os.Getwd()
		if err != nil {
			poisonWasmErr = err
			return
		}
		out := filepath.Join(dir, "poison.wasm")
		cmd := exec.CommandContext(t.Context(), "go", "build", "-buildmode=c-shared", "-o", out, "./testdata/poisonplugin")
		cmd.Dir = wd
		cmd.Env = append(os.Environ(), "GOOS=wasip1", "GOARCH=wasm")
		if output, buildErr := cmd.CombinedOutput(); buildErr != nil {
			poisonWasmErr = fmt.Errorf("build poison fixture: %w: %s", buildErr, output)
			return
		}
		poisonWasmPath = out
	})
	if poisonWasmErr != nil {
		t.Fatalf("build poison fixture: %v", poisonWasmErr)
	}
	return poisonWasmPath
}

// loadPoisonPlugin compiles (see buildPoisonFixture) and loads the poison
// fixture into a fresh Runtime. The fixture's malloc export is an
// intentionally unsafe bump allocator -- it advances its cursor with no
// bounds check, the same shape a real plugin SDK allocator has -- so tests
// can deterministically trigger the out-of-bounds write that used to poison
// plugin instances.
func loadPoisonPlugin(t *testing.T, limits ResourceLimits) *Runtime {
	t.Helper()
	return loadPoisonPluginWithLogger(t, limits, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// loadPoisonPluginWithLogger is loadPoisonPlugin with an injectable logger, so
// tests can assert on log output (e.g. the dispatchEvent size-limit warning)
// without scraping stderr.
func loadPoisonPluginWithLogger(t *testing.T, limits ResourceLimits, log *slog.Logger) *Runtime {
	t.Helper()

	wasmPath := buildPoisonFixture(t)
	wasmBytes, err := os.ReadFile(wasmPath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	dir := t.TempDir()
	pluginDir := filepath.Join(dir, testPluginName)
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatalf("mkdir fixture plugin dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pluginDir, "backend.wasm"), wasmBytes, 0o644); err != nil {
		t.Fatalf("write fixture wasm: %v", err)
	}

	store := &Store{cfg: StoreConfig{Store: "local", WASMDir: dir}}
	rt := NewRuntime(store, HostServices{}, limits, log)

	p := plugindom.Plugin{
		Name:    testPluginName,
		Enabled: true,
		Manifest: plugindom.PluginManifest{
			Backend: &plugindom.BackendManifest{},
		},
	}
	ctx := context.Background()
	if err := rt.Load(ctx, p); err != nil {
		t.Fatalf("load fixture plugin: %v", err)
	}
	t.Cleanup(func() { rt.Unload(ctx, testPluginName) })
	return rt
}

// instanceFor looks up the loaded poison-plugin instance directly, for tests
// that need to call dispatchEvent (an unexported method) without going
// through EmitEvent's topic-subscription filtering.
func instanceFor(rt *Runtime, name string) *pluginInstance {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	return rt.plugins[name]
}

// TestHandleRequest_OversizedPayload_RejectedWithoutTouchingPlugin pins the
// fast path: when a payload exceeds ResourceLimits.MaxRequestBodyBytes,
// HandleRequest must reject it before ever calling the plugin's malloc
// export. A normal request right after must still succeed, proving the
// rejected call left no trace in the plugin's allocator state.
func TestHandleRequest_OversizedPayload_RejectedWithoutTouchingPlugin(t *testing.T) {
	limits := DefaultResourceLimits()
	limits.MaxRequestBodyBytes = 1024 // far smaller than the fixture's actual memory
	rt := loadPoisonPlugin(t, limits)
	ctx := context.Background()

	oversized := make([]byte, 2048)
	if _, err := rt.HandleRequest(ctx, testPluginName, oversized); err == nil {
		t.Fatal("expected oversized request to be rejected")
	}

	if _, err := rt.HandleRequest(ctx, testPluginName, []byte("hello")); err != nil {
		t.Fatalf("expected normal request to succeed after rejection, got: %v", err)
	}
}

// TestHandleRequest_AllocatorFailure_RecoveredByReset reproduces the
// reported bug directly: with the pre-check disabled, an oversized payload
// reaches wazero's own memory-bounds check inside writeToMemory. Before the
// fix, HandleRequest returned that error without ever calling
// ResetAllocator, so the plugin's bump-allocator cursor stayed corrupted and
// every later call -- including tiny, well-formed ones -- failed the same
// way forever. This test fails on the old code and passes on the fix.
func TestHandleRequest_AllocatorFailure_RecoveredByReset(t *testing.T) {
	limits := DefaultResourceLimits()
	limits.MaxRequestBodyBytes = 0 // disabled, so the write reaches wazero's bounds check
	rt := loadPoisonPlugin(t, limits)
	ctx := context.Background()

	huge := make([]byte, 200*1024*1024) // far beyond the module's actual linear memory
	if _, err := rt.HandleRequest(ctx, testPluginName, huge); err == nil {
		t.Fatal("expected the oversized write to fail at the wazero memory-bounds check")
	}

	for i := 0; i < 3; i++ {
		if _, err := rt.HandleRequest(ctx, testPluginName, []byte("hi")); err != nil {
			t.Fatalf("call %d after the oversized request failed -- instance still poisoned: %v", i, err)
		}
	}
}

// TestDispatchEvent_OversizedPayload_RejectedWithoutTouchingPlugin mirrors
// TestHandleRequest_OversizedPayload_RejectedWithoutTouchingPlugin for the
// event-dispatch path: dispatchEvent must reject a payload over
// ResourceLimits.MaxRequestBodyBytes before ever calling the plugin's malloc
// export, rather than relying solely on the unconditional allocator reset to
// recover afterward. A normal call right after must still succeed.
func TestDispatchEvent_OversizedPayload_RejectedWithoutTouchingPlugin(t *testing.T) {
	limits := DefaultResourceLimits()
	limits.MaxRequestBodyBytes = 1024 // far smaller than the fixture's actual memory

	var logBuf bytes.Buffer
	rt := loadPoisonPluginWithLogger(t, limits, slog.New(slog.NewTextHandler(&logBuf, nil)))
	inst := instanceFor(rt, testPluginName)
	ctx := context.Background()

	oversized := make([]byte, 2048)
	rt.dispatchEvent(ctx, inst, "some.topic", oversized)

	if !strings.Contains(logBuf.String(), "exceeds size limit") {
		t.Fatalf("expected a size-limit warning to be logged, got: %s", logBuf.String())
	}
	if strings.Contains(logBuf.String(), "write event payload") {
		t.Fatalf("dispatchEvent should reject before ever attempting to write into plugin memory, got: %s", logBuf.String())
	}

	if _, err := rt.HandleRequest(ctx, testPluginName, []byte("hello")); err != nil {
		t.Fatalf("expected normal request to succeed after oversized event, got: %v", err)
	}
}

// TestHandleRequest_Concurrent_DoesNotCorruptSharedInstance pins the
// lock-ordering fix: writeToMemory (which calls the plugin's malloc export)
// must happen while holding the per-instance lock, not before acquiring it,
// since wazero module calls are not safe to interleave. Run with -race.
func TestHandleRequest_Concurrent_DoesNotCorruptSharedInstance(t *testing.T) {
	rt := loadPoisonPlugin(t, DefaultResourceLimits())
	ctx := context.Background()

	const workers = 20
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := rt.HandleRequest(ctx, testPluginName, []byte("concurrent"))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("concurrent HandleRequest failed: %v", err)
		}
	}
}
