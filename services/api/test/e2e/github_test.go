package e2e_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	globalroledom "github.com/paca/api/internal/domain/globalrole"
	projectdom "github.com/paca/api/internal/domain/project"
	taskdom "github.com/paca/api/internal/domain/task"
	"github.com/paca/api/internal/platform/authz"
	"github.com/paca/api/internal/platform/secret"
	jwttoken "github.com/paca/api/internal/platform/token"
	pgRepo "github.com/paca/api/internal/repository/postgres"
	githubsvc "github.com/paca/api/internal/service/github"
	projectsvc "github.com/paca/api/internal/service/project"
	sprintsvc "github.com/paca/api/internal/service/sprint"
	tasksvc "github.com/paca/api/internal/service/task"
	"github.com/paca/api/internal/transport/http/handler"
	"github.com/paca/api/internal/transport/http/router"
)

// ---------------------------------------------------------------------------
// Fake GitHub API server
// ---------------------------------------------------------------------------

// fakeGitHubServer returns an httptest.Server that mimics the GitHub REST API
// endpoints exercised by the GitHub integration service.
func fakeGitHubServer(t *testing.T) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()

	// GET /user — token validation
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"login":"testuser","id":1}`)
	})

	// GET /user/repos — list accessible repositories
	mux.HandleFunc("/user/repos", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `[{"id":1,"full_name":"testorg/testrepo","name":"testrepo","owner":{"login":"testorg"},"default_branch":"main","private":false}]`)
	})

	// GET /repos/testorg/testrepo — repository metadata
	mux.HandleFunc("/repos/testorg/testrepo", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			// Handled by sub-pattern below; this should not be reached.
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"id":1,"full_name":"testorg/testrepo","name":"testrepo","owner":{"login":"testorg"},"default_branch":"main","private":false}`)
	})

	// POST /repos/testorg/testrepo/hooks — create webhook
	mux.HandleFunc("/repos/testorg/testrepo/hooks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = fmt.Fprint(w, `{"id":99999}`)
	})

	// DELETE /repos/testorg/testrepo/hooks/99999 — delete webhook
	mux.HandleFunc("/repos/testorg/testrepo/hooks/99999", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	// GET /repos/testorg/testrepo/pulls/1 — pull request metadata
	mux.HandleFunc("/repos/testorg/testrepo/pulls/1", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"id":12345,"number":1,"title":"feat: e2e PR","state":"open","html_url":"https://github.com/testorg/testrepo/pull/1","head":{"ref":"feat/e2e"},"base":{"ref":"main"},"user":{"login":"testuser"},"merged":false}`)
	})

	// GET /repos/testorg/testrepo/git/ref/heads/main — SHA lookup for branch creation
	mux.HandleFunc("/repos/testorg/testrepo/git/ref/heads/main", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"ref":"refs/heads/main","object":{"sha":"abc1234def5678abc1234def5678abc1234def56"}}`)
	})

	// POST /repos/testorg/testrepo/git/refs — create git ref (branch)
	mux.HandleFunc("/repos/testorg/testrepo/git/refs", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = fmt.Fprint(w, `{"ref":"refs/heads/feat/new-branch","object":{"sha":"abc1234def5678abc1234def5678abc1234def56"}}`)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// ---------------------------------------------------------------------------
// GitHub e2e environment
// ---------------------------------------------------------------------------

// ghE2EEnv holds a complete environment for GitHub integration e2e tests,
// including a second HTTP test server that has the GitHub handler registered.
type ghE2EEnv struct {
	base   string       // URL of the GitHub-capable test server
	client *http.Client // cookie-aware client pointed at ghBase
	env    *e2eEnv      // underlying base env (user/project services, DB)
}

// newGHE2EEnv builds a GitHub-capable e2e environment.
// It calls newE2EEnv for containers/DB setup, then wires the GitHub handler
// into a separate httptest.Server backed by the same per-test Postgres DB.
func newGHE2EEnv(t *testing.T) *ghE2EEnv {
	t.Helper()

	env := newE2EEnv(t)

	// 32-byte AES key (fixed, for reproducibility in tests).
	encKey := [32]byte{}
	copy(encKey[:], "e2e-test-aes-key-32bytes-padded!!")
	enc, err := secret.NewEncryptor(encKey[:])
	if err != nil {
		t.Fatalf("create test encryptor: %v", err)
	}

	// Fake GitHub REST API server.
	fakeGH := fakeGitHubServer(t)

	// Real GitHub Postgres repository backed by the per-test DB.
	ghRepo := pgRepo.NewGitHubRepository(env.db)

	// Auxiliary repos / services from the same DB.
	db := env.db
	authzStore := pgRepo.NewAuthzPermissionStore(db)
	taskRepo := pgRepo.NewTaskRepository(db)
	projectRepo := pgRepo.NewProjectRepository(db)
	viewRepo := pgRepo.NewViewRepository(db)
	activityRepo := pgRepo.NewTaskActivityRepository(db)

	// GitHub service pointing at the fake GitHub API.
	// webhookURL is empty so webhook creation uses the ErrWebhookURLRequired
	// path unless we set it below. For e2e we set a dummy public URL.
	ghSvc := githubsvc.New(ghRepo, enc, fakeGH.URL+"/fake-webhook").
		WithClientBaseURL(fakeGH.URL).
		WithTaskLookup(&e2eTaskLookup{projectRepo: projectRepo, taskRepo: taskRepo})

	tm := jwttoken.New(e2eJWTSecret, e2eAccessTTL, e2eRefreshTTL)
	projectService := projectsvc.New(projectRepo, taskRepo)
	taskService := tasksvc.New(taskRepo)
	viewService := sprintsvc.NewViewService(viewRepo)
	activityService := tasksvc.NewActivityService(activityRepo, projectRepo, nil)

	engine := router.New(router.Deps{
		TokenManager: tm,
		Authorizer:   authz.NewAuthorizer(authzStore),
		Health:       handler.NewHealthHandler(),
		// Auth: not wired; tests issue tokens directly via tm.IssueAccess
		Project: handler.NewProjectHandler(projectService, authz.NewAuthorizer(authzStore)),
		Task:    handler.NewTaskHandler(taskService, viewService, activityService),
		GitHub:  handler.NewGitHubHandler(ghSvc),
		Log:     slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn})),
	})

	srv := httptest.NewServer(engine)
	t.Cleanup(srv.Close)

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 30 * time.Second}

	return &ghE2EEnv{
		base:   srv.URL,
		client: client,
		env:    env,
	}
}

// issueGHToken returns a signed Bearer token for a user with global project+task write.
func issueGHToken(t *testing.T, userID uuid.UUID) string {
	t.Helper()
	tm := jwttoken.New(e2eJWTSecret, e2eAccessTTL, e2eRefreshTTL)
	tok, err := tm.IssueAccess(userID.String(), "gh-test-user", "USER", uuid.NewString(), false)
	if err != nil {
		t.Fatalf("issue gh test token: %v", err)
	}
	return tok
}

// seedGHAdminRole creates a role in the DB that grants all project & task permissions.
func seedGHAdminRole(t *testing.T, env *e2eEnv, userID uuid.UUID) {
	t.Helper()
	roleName := "GH_ADMIN_" + uuid.NewString()
	if err := env.roleRepo.Create(env.ctx, &globalroledom.GlobalRole{
		ID:   uuid.New(),
		Name: roleName,
		Permissions: map[string]any{
			"projects.create": true,
			"projects.read":   true,
			"projects.write":  true,
			"tasks.read":      true,
			"tasks.write":     true,
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("create gh-admin role: %v", err)
	}
	role, err := env.roleRepo.FindByName(env.ctx, roleName)
	if err != nil {
		t.Fatalf("find gh-admin role: %v", err)
	}
	if err := env.roleRepo.ReplaceUserRoles(env.ctx, userID, []uuid.UUID{role.ID}); err != nil {
		t.Fatalf("assign gh-admin role: %v", err)
	}
}

// createGHProject creates a project in the DB and returns its ID.
func createGHProject(t *testing.T, env *e2eEnv, ownerID uuid.UUID, name string) uuid.UUID {
	t.Helper()
	proj, err := env.projectSvc.Create(env.ctx, projectdom.CreateProjectInput{
		Name:      name,
		CreatedBy: &ownerID,
	})
	if err != nil {
		t.Fatalf("create project %q: %v", name, err)
	}
	return proj.ID
}

// doGHRequest sends an authenticated JSON request to the GitHub test server.
func (g *ghE2EEnv) doGHRequest(t *testing.T, method, path string, tok string, body any) *http.Response {
	t.Helper()
	var buf *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewBuffer(b)
	} else {
		buf = bytes.NewBuffer(nil)
	}
	req, err := http.NewRequestWithContext(g.env.ctx, method, g.base+path, buf)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	resp, err := g.client.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, path, err)
	}
	return resp
}

// decodeGHEnvelope decodes the standard response envelope and returns the data map.
func decodeGHEnvelope(t *testing.T, resp *http.Response) (map[string]any, string) {
	t.Helper()
	var env struct {
		Success   bool           `json:"success"`
		Data      map[string]any `json:"data"`
		ErrorCode string         `json:"error_code"`
		Error     string         `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return env.Data, env.ErrorCode
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestGitHubE2E_SetAndGetIntegration(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser1", "pass1234", "GH User 1")
	u, err := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser1")
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 1")
	tok := issueGHToken(t, userID)

	// Set token.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok,
		map[string]string{"token": "ghp_fake_token_for_e2e_test"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		data, code := decodeGHEnvelope(t, resp)
		t.Fatalf("set token: expected 200, got %d (code=%s data=%v)", resp.StatusCode, code, data)
	}

	// Get integration.
	resp2 := g.doGHRequest(t, http.MethodGet,
		"/api/v1/projects/"+projectID.String()+"/github",
		tok, nil)
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusOK {
		data, code := decodeGHEnvelope(t, resp2)
		t.Fatalf("get integration: expected 200, got %d (code=%s data=%v)", resp2.StatusCode, code, data)
	}
	data, _ := decodeGHEnvelope(t, resp2)
	if data["project_id"] != projectID.String() {
		t.Errorf("expected project_id %q, got %v", projectID, data["project_id"])
	}
}

func TestGitHubE2E_GetIntegration_NotFound(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser2", "pass1234", "GH User 2")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser2")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 2")
	tok := issueGHToken(t, userID)

	resp := g.doGHRequest(t, http.MethodGet,
		"/api/v1/projects/"+projectID.String()+"/github",
		tok, nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
	_, code := decodeGHEnvelope(t, resp)
	if code != "GITHUB_INTEGRATION_NOT_FOUND" {
		t.Errorf("expected GITHUB_INTEGRATION_NOT_FOUND, got %q", code)
	}
}

func TestGitHubE2E_LinkAndGetRepository(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser3", "pass1234", "GH User 3")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser3")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 3")
	tok := issueGHToken(t, userID)

	// Set token first.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake_e2e"})
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("set token: expected 200, got %d", resp.StatusCode)
	}

	// Link repository.
	resp2 := g.doGHRequest(t, http.MethodPost,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, map[string]string{"owner": "testorg", "repo_name": "testrepo"})
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusCreated {
		data, code := decodeGHEnvelope(t, resp2)
		t.Fatalf("link repo: expected 201, got %d (code=%s data=%v)", resp2.StatusCode, code, data)
	}
	data, _ := decodeGHEnvelope(t, resp2)
	if data["full_name"] != "testorg/testrepo" {
		t.Errorf("expected full_name testorg/testrepo, got %v", data["full_name"])
	}
	repoIDStr, _ := data["id"].(string)
	if repoIDStr == "" {
		t.Fatal("expected non-empty repo id in response")
	}

	// List linked repositories.
	resp3 := g.doGHRequest(t, http.MethodGet,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, nil)
	defer func() { _ = resp3.Body.Close() }()
	if resp3.StatusCode != http.StatusOK {
		t.Fatalf("list repos: expected 200, got %d", resp3.StatusCode)
	}
	var listEnv struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(resp3.Body).Decode(&listEnv); err != nil {
		t.Fatalf("decode list repos: %v", err)
	}
	if len(listEnv.Data) != 1 {
		t.Errorf("expected 1 linked repo, got %d", len(listEnv.Data))
	}
}

func TestGitHubE2E_LinkPRAndList(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser4", "pass1234", "GH User 4")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser4")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 4")
	tok := issueGHToken(t, userID)

	// Set token.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake"})
	_ = resp.Body.Close()

	// Link repository.
	resp = g.doGHRequest(t, http.MethodPost,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, map[string]string{"owner": "testorg", "repo_name": "testrepo"})
	if resp.StatusCode != http.StatusCreated {
		_ = resp.Body.Close()
		t.Fatalf("link repo: expected 201, got %d", resp.StatusCode)
	}
	var linkEnv struct {
		Data map[string]any `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&linkEnv); err != nil {
		t.Fatalf("decode link repo: %v", err)
	}
	_ = resp.Body.Close()
	repoIDStr, _ := linkEnv.Data["id"].(string)

	// Create a task to link the PR to.
	task, err := g.env.taskSvc.CreateTask(g.env.ctx, taskdom.CreateTaskInput{
		ProjectID: projectID,
		Title:     "Test Task",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	// Link PR to task.
	resp = g.doGHRequest(t, http.MethodPost,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/pull-requests", projectID, task.ID),
		tok, map[string]any{"repo_id": repoIDStr, "pr_number": 1})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		data, code := decodeGHEnvelope(t, resp)
		t.Fatalf("link PR: expected 201, got %d (code=%s data=%v)", resp.StatusCode, code, data)
	}
	data, _ := decodeGHEnvelope(t, resp)
	if data["pr_number"] != float64(1) {
		t.Errorf("expected pr_number 1, got %v", data["pr_number"])
	}

	// List PRs for the task.
	resp2 := g.doGHRequest(t, http.MethodGet,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/pull-requests", projectID, task.ID),
		tok, nil)
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("list PRs: expected 200, got %d", resp2.StatusCode)
	}
	var listEnv struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(resp2.Body).Decode(&listEnv); err != nil {
		t.Fatalf("decode list PRs: %v", err)
	}
	if len(listEnv.Data) != 1 {
		t.Errorf("expected 1 PR, got %d", len(listEnv.Data))
	}
}

func TestGitHubE2E_CreateBranch(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser5", "pass1234", "GH User 5")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser5")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 5")
	tok := issueGHToken(t, userID)

	// Set token and link repository.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake"})
	_ = resp.Body.Close()
	repoResp := g.doGHRequest(t, http.MethodPost,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, map[string]string{"owner": "testorg", "repo_name": "testrepo"})
	var repoEnv struct {
		Data map[string]any `json:"data"`
	}
	if err := json.NewDecoder(repoResp.Body).Decode(&repoEnv); err != nil {
		t.Fatalf("decode link repo: %v", err)
	}
	_ = repoResp.Body.Close()
	repoIDStr, _ := repoEnv.Data["id"].(string)

	// Create a task.
	task, err := g.env.taskSvc.CreateTask(g.env.ctx, taskdom.CreateTaskInput{
		ProjectID: projectID,
		Title:     "Branch Task",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	// Create a branch.
	resp = g.doGHRequest(t, http.MethodPost,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/branches", projectID, task.ID),
		tok, map[string]string{"repo_id": repoIDStr, "branch_name": "feat/e2e-new-branch", "source_branch": "main"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated {
		data, code := decodeGHEnvelope(t, resp)
		t.Fatalf("create branch: expected 201, got %d (code=%s data=%v)", resp.StatusCode, code, data)
	}
	data, _ := decodeGHEnvelope(t, resp)
	if data["branch_name"] != "feat/e2e-new-branch" {
		t.Errorf("expected branch_name feat/e2e-new-branch, got %v", data["branch_name"])
	}
}

func TestGitHubE2E_Webhook_Delivery(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser6", "pass1234", "GH User 6")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser6")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 6")
	tok := issueGHToken(t, userID)

	// Set token and link repository.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake_e2e"})
	_ = resp.Body.Close()
	resp = g.doGHRequest(t, http.MethodPost,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, map[string]string{"owner": "testorg", "repo_name": "testrepo"})
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("link repo: expected 201, got %d", resp.StatusCode)
	}

	// The stored webhook secret needs to match the HMAC we compute below.
	// We bypass this by sending a bogus signature; the handler always returns
	// 204 regardless (it silently ignores invalid signatures).
	payload := `{"repository":{"full_name":"testorg/testrepo"},"action":"opened","pull_request":{"id":99,"number":2,"title":"webhook PR","state":"open","html_url":"https://github.com/testorg/testrepo/pull/2","head":{"ref":"feat/wh"},"base":{"ref":"main"},"user":{"login":"testuser"}}}`

	mac := hmac.New(sha256.New, []byte("wrong-secret"))
	mac.Write([]byte(payload))
	sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	req, _ := http.NewRequestWithContext(g.env.ctx, http.MethodPost,
		g.base+"/api/v1/github/webhook",
		bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "pull_request")
	req.Header.Set("X-Hub-Signature-256", sig)

	wresp, err := g.client.Do(req)
	if err != nil {
		t.Fatalf("webhook request: %v", err)
	}
	_ = wresp.Body.Close()

	// Webhook always returns 204.
	if wresp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", wresp.StatusCode)
	}
}

func TestGitHubE2E_DeleteToken(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser7", "pass1234", "GH User 7")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser7")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 7")
	tok := issueGHToken(t, userID)

	// Set token.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake_delete"})
	_ = resp.Body.Close()

	// Delete token.
	resp = g.doGHRequest(t, http.MethodDelete,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, nil)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete token: expected 204, got %d", resp.StatusCode)
	}

	// Integration should now be gone.
	resp2 := g.doGHRequest(t, http.MethodGet,
		"/api/v1/projects/"+projectID.String()+"/github",
		tok, nil)
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusNotFound {
		t.Fatalf("after delete: expected 404, got %d", resp2.StatusCode)
	}
}

func TestGitHubE2E_ListTaskBranches(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser8", "pass1234", "GH User 8")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser8")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)
	projectID := createGHProject(t, g.env, userID, "GH E2E Project 8")
	tok := issueGHToken(t, userID)

	// Set token and link repository.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake"})
	_ = resp.Body.Close()
	repoResp := g.doGHRequest(t, http.MethodPost,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, map[string]string{"owner": "testorg", "repo_name": "testrepo"})
	var repoEnv struct {
		Data map[string]any `json:"data"`
	}
	json.NewDecoder(repoResp.Body).Decode(&repoEnv) //nolint:errcheck
	_ = repoResp.Body.Close()
	repoIDStr, _ := repoEnv.Data["id"].(string)
	if repoIDStr == "" {
		t.Fatal("link repo: expected repo id in response")
	}

	// Create a task.
	task, err := g.env.taskSvc.CreateTask(g.env.ctx, taskdom.CreateTaskInput{
		ProjectID: projectID,
		Title:     "List Branches Task",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	// List branches — should be empty before any branch is created.
	respList0 := g.doGHRequest(t, http.MethodGet,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/branches", projectID, task.ID),
		tok, nil)
	defer func() { _ = respList0.Body.Close() }()
	if respList0.StatusCode != http.StatusOK {
		t.Fatalf("initial list: expected 200, got %d", respList0.StatusCode)
	}
	var listEnv0 struct {
		Data []any `json:"data"`
	}
	json.NewDecoder(respList0.Body).Decode(&listEnv0) //nolint:errcheck
	if len(listEnv0.Data) != 0 {
		t.Errorf("initial list: expected 0 branches, got %d", len(listEnv0.Data))
	}

	// Create a branch.
	respBranch := g.doGHRequest(t, http.MethodPost,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/branches", projectID, task.ID),
		tok, map[string]string{"repo_id": repoIDStr, "branch_name": "feat/e2e-list-branch"})
	defer func() { _ = respBranch.Body.Close() }()
	if respBranch.StatusCode != http.StatusCreated {
		data, code := decodeGHEnvelope(t, respBranch)
		t.Fatalf("create branch: expected 201, got %d (code=%s data=%v)", respBranch.StatusCode, code, data)
	}

	// List branches — should now contain the created branch.
	respList1 := g.doGHRequest(t, http.MethodGet,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/branches", projectID, task.ID),
		tok, nil)
	defer func() { _ = respList1.Body.Close() }()
	if respList1.StatusCode != http.StatusOK {
		t.Fatalf("after create: list expected 200, got %d", respList1.StatusCode)
	}
	var listEnv1 struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(respList1.Body).Decode(&listEnv1); err != nil {
		t.Fatalf("decode list branches: %v", err)
	}
	if len(listEnv1.Data) != 1 {
		t.Fatalf("expected 1 branch, got %d", len(listEnv1.Data))
	}
	if listEnv1.Data[0]["branch_name"] != "feat/e2e-list-branch" {
		t.Errorf("expected branch_name feat/e2e-list-branch, got %v", listEnv1.Data[0]["branch_name"])
	}
	if listEnv1.Data[0]["task_id"] != task.ID.String() {
		t.Errorf("expected task_id %s, got %v", task.ID, listEnv1.Data[0]["task_id"])
	}
}

func TestGitHubE2E_Webhook_PushEvent_AutoLinksBranch(t *testing.T) {
	g := newGHE2EEnv(t)
	seedUser(t, g.env, "ghuser9", "pass1234", "GH User 9")
	u, _ := g.env.userRepo.FindByUsername(g.env.ctx, "ghuser9")
	userID := u.ID
	seedGHAdminRole(t, g.env, userID)

	// Create project with a known task_id_prefix so branch name can be matched.
	proj, err := g.env.projectSvc.Create(g.env.ctx, projectdom.CreateProjectInput{
		Name:         "GH E2E Project 9",
		TaskIDPrefix: "PUSH",
		CreatedBy:    &userID,
	})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	projectID := proj.ID
	tok := issueGHToken(t, userID)

	// Set token and link repository.
	resp := g.doGHRequest(t, http.MethodPut,
		"/api/v1/projects/"+projectID.String()+"/github/token",
		tok, map[string]string{"token": "ghp_fake_push"})
	_ = resp.Body.Close()
	repoResp := g.doGHRequest(t, http.MethodPost,
		"/api/v1/projects/"+projectID.String()+"/github/linked-repositories",
		tok, map[string]string{"owner": "testorg", "repo_name": "testrepo"})
	var repoEnv struct {
		Data map[string]any `json:"data"`
	}
	json.NewDecoder(repoResp.Body).Decode(&repoEnv) //nolint:errcheck
	_ = repoResp.Body.Close()
	if repoEnv.Data["id"] == "" {
		t.Fatal("link repo: no id in response")
	}

	// Create a task — its task_number will be auto-assigned (first task → 1).
	task, err := g.env.taskSvc.CreateTask(g.env.ctx, taskdom.CreateTaskInput{
		ProjectID: projectID,
		Title:     "Push Webhook Task",
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	// Clear the webhook_secret_enc so signature verification is skipped.
	if err := g.env.db.Exec(
		"UPDATE github_repositories SET webhook_secret_enc = '' WHERE project_id = ?",
		projectID.String(),
	).Error; err != nil {
		t.Fatalf("clear webhook secret: %v", err)
	}

	// Send a push event for a new branch matching "PUSH-{task_number}".
	branchName := fmt.Sprintf("feat/PUSH-%d", task.TaskNumber)
	payload := fmt.Sprintf(
		`{"ref":"refs/heads/%s","created":true,"deleted":false,"repository":{"full_name":"testorg/testrepo"}}`,
		branchName,
	)

	req, _ := http.NewRequestWithContext(g.env.ctx, http.MethodPost,
		g.base+"/api/v1/github/webhook",
		bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Event", "push")
	// No valid signature — accepted because webhook_secret_enc is empty.
	wresp, err := g.client.Do(req)
	if err != nil {
		t.Fatalf("webhook request: %v", err)
	}
	_ = wresp.Body.Close()
	if wresp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", wresp.StatusCode)
	}

	// The push handler runs asynchronously-equivalent (same goroutine, no delay needed).
	// Verify the branch was auto-linked to the task.
	respList := g.doGHRequest(t, http.MethodGet,
		fmt.Sprintf("/api/v1/projects/%s/tasks/%s/github/branches", projectID, task.ID),
		tok, nil)
	defer func() { _ = respList.Body.Close() }()
	if respList.StatusCode != http.StatusOK {
		t.Fatalf("list branches: expected 200, got %d", respList.StatusCode)
	}
	var listEnv struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(respList.Body).Decode(&listEnv); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listEnv.Data) != 1 {
		t.Fatalf("expected 1 auto-linked branch, got %d", len(listEnv.Data))
	}
	if listEnv.Data[0]["branch_name"] != branchName {
		t.Errorf("expected branch_name %q, got %v", branchName, listEnv.Data[0]["branch_name"])
	}
}

// ---------------------------------------------------------------------------
// e2eTaskLookup — implements githubsvc.TaskLookup for e2e tests
// ---------------------------------------------------------------------------

type e2eTaskLookup struct {
	projectRepo *pgRepo.ProjectRepository
	taskRepo    *pgRepo.TaskRepository
}

func (l *e2eTaskLookup) FindTaskByProjectPrefixAndNumber(ctx context.Context, prefix string, number int64) (uuid.UUID, uuid.UUID, error) {
	project, err := l.projectRepo.FindByTaskIDPrefix(ctx, prefix)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	task, err := l.taskRepo.FindTaskByNumber(ctx, project.ID, number)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	return task.ID, task.ProjectID, nil
}
