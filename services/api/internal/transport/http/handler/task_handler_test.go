package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	sprintdom "github.com/paca/api/internal/domain/sprint"
	taskdom "github.com/paca/api/internal/domain/task"
	"github.com/paca/api/internal/transport/http/handler"
)

// ---------------------------------------------------------------------------
// Fake task service
// ---------------------------------------------------------------------------

type fakeTaskSvc struct {
	mu    sync.RWMutex
	tasks map[uuid.UUID]*taskdom.Task
	types map[uuid.UUID]*taskdom.TaskType
}

func newFakeTaskSvc() *fakeTaskSvc {
	return &fakeTaskSvc{
		tasks: make(map[uuid.UUID]*taskdom.Task),
		types: make(map[uuid.UUID]*taskdom.TaskType),
	}
}

// -- TaskTypeService --

func (f *fakeTaskSvc) ListTaskTypes(_ context.Context, _ uuid.UUID) ([]*taskdom.TaskType, error) {
	return nil, nil
}

func (f *fakeTaskSvc) GetTaskType(_ context.Context, _ uuid.UUID) (*taskdom.TaskType, error) {
	return nil, taskdom.ErrTypeNotFound
}

func (f *fakeTaskSvc) CreateTaskType(_ context.Context, in taskdom.CreateTaskTypeInput) (*taskdom.TaskType, error) {
	if in.Name == "" {
		return nil, taskdom.ErrTypeNameInvalid
	}
	now := time.Now()
	t := &taskdom.TaskType{ID: uuid.New(), ProjectID: in.ProjectID, Name: in.Name, CreatedAt: now, UpdatedAt: now}
	f.mu.Lock()
	f.types[t.ID] = t
	f.mu.Unlock()
	return t, nil
}

func (f *fakeTaskSvc) UpdateTaskType(_ context.Context, _ uuid.UUID, _ taskdom.UpdateTaskTypeInput) (*taskdom.TaskType, error) {
	return nil, taskdom.ErrTypeNotFound
}

func (f *fakeTaskSvc) DeleteTaskType(_ context.Context, _ uuid.UUID) error { return nil }

// -- TaskStatusService --

func (f *fakeTaskSvc) ListTaskStatuses(_ context.Context, _ uuid.UUID) ([]*taskdom.TaskStatus, error) {
	return nil, nil
}

func (f *fakeTaskSvc) GetTaskStatus(_ context.Context, _ uuid.UUID) (*taskdom.TaskStatus, error) {
	return nil, taskdom.ErrStatusNotFound
}

func (f *fakeTaskSvc) CreateTaskStatus(_ context.Context, in taskdom.CreateTaskStatusInput) (*taskdom.TaskStatus, error) {
	if !taskdom.ValidStatusCategories[in.Category] {
		return nil, taskdom.ErrStatusCategoryInvalid
	}
	now := time.Now()
	s := &taskdom.TaskStatus{ID: uuid.New(), ProjectID: in.ProjectID, Name: in.Name, Category: in.Category, CreatedAt: now, UpdatedAt: now}
	return s, nil
}

func (f *fakeTaskSvc) UpdateTaskStatus(_ context.Context, _ uuid.UUID, _ taskdom.UpdateTaskStatusInput) (*taskdom.TaskStatus, error) {
	return nil, taskdom.ErrStatusNotFound
}

func (f *fakeTaskSvc) DeleteTaskStatus(_ context.Context, _ uuid.UUID) error { return nil }

// -- TaskService --

func (f *fakeTaskSvc) ListTasks(_ context.Context, _ uuid.UUID, _ taskdom.TaskFilter, _, _ int) ([]*taskdom.Task, int64, error) {
	return nil, 0, nil
}

func (f *fakeTaskSvc) GetTask(_ context.Context, id uuid.UUID) (*taskdom.Task, error) {
	f.mu.RLock()
	t, ok := f.tasks[id]
	f.mu.RUnlock()
	if !ok {
		return nil, taskdom.ErrTaskNotFound
	}
	cp := *t
	return &cp, nil
}

func (f *fakeTaskSvc) CreateTask(_ context.Context, in taskdom.CreateTaskInput) (*taskdom.Task, error) {
	if in.Title == "" {
		return nil, taskdom.ErrTaskTitleInvalid
	}
	now := time.Now()
	t := &taskdom.Task{
		ID:           uuid.New(),
		ProjectID:    in.ProjectID,
		Title:        in.Title,
		SprintID:     in.SprintID,
		StatusID:     in.StatusID,
		CustomFields: map[string]any{},
		Tags:         []string{},
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	f.mu.Lock()
	f.tasks[t.ID] = t
	f.mu.Unlock()
	return t, nil
}

func (f *fakeTaskSvc) UpdateTask(_ context.Context, id uuid.UUID, in taskdom.UpdateTaskInput) (*taskdom.Task, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	t, ok := f.tasks[id]
	if !ok {
		return nil, taskdom.ErrTaskNotFound
	}
	if in.StatusID != nil {
		t.StatusID = *in.StatusID
	}
	if in.SprintID != nil {
		t.SprintID = *in.SprintID
	}
	if in.TaskTypeID != nil {
		t.TaskTypeID = *in.TaskTypeID
	}
	if in.Description != nil {
		t.Description = *in.Description
	}
	cp := *t
	return &cp, nil
}

func (f *fakeTaskSvc) DeleteTask(_ context.Context, id uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.tasks[id]; !ok {
		return taskdom.ErrTaskNotFound
	}
	delete(f.tasks, id)
	return nil
}

// -- CustomFieldDefinitionService --

func (f *fakeTaskSvc) ListCustomFieldDefinitions(_ context.Context, _ uuid.UUID) ([]*taskdom.CustomFieldDefinition, error) {
	return nil, nil
}

func (f *fakeTaskSvc) GetCustomFieldDefinition(_ context.Context, _ uuid.UUID) (*taskdom.CustomFieldDefinition, error) {
	return nil, taskdom.ErrCustomFieldNotFound
}

func (f *fakeTaskSvc) CreateCustomFieldDefinition(_ context.Context, _ taskdom.CreateCustomFieldDefinitionInput) (*taskdom.CustomFieldDefinition, error) {
	return nil, nil
}

func (f *fakeTaskSvc) UpdateCustomFieldDefinition(_ context.Context, _ uuid.UUID, _ taskdom.UpdateCustomFieldDefinitionInput) (*taskdom.CustomFieldDefinition, error) {
	return nil, taskdom.ErrCustomFieldNotFound
}

func (f *fakeTaskSvc) DeleteCustomFieldDefinition(_ context.Context, _ uuid.UUID) error { return nil }

// ---------------------------------------------------------------------------
// Fake view service (no-op)
// ---------------------------------------------------------------------------

type fakeViewSvcTask struct{}

func (f *fakeViewSvcTask) ListViews(_ context.Context, _ uuid.UUID) ([]*sprintdom.SprintView, error) {
	return nil, nil
}

func (f *fakeViewSvcTask) ListBacklogViews(_ context.Context, _ uuid.UUID) ([]*sprintdom.SprintView, error) {
	return nil, nil
}

func (f *fakeViewSvcTask) GetView(_ context.Context, _ uuid.UUID) (*sprintdom.SprintView, error) {
	return nil, sprintdom.ErrViewNotFound
}

func (f *fakeViewSvcTask) CreateView(_ context.Context, _ sprintdom.CreateViewInput) (*sprintdom.SprintView, error) {
	return nil, nil
}

func (f *fakeViewSvcTask) UpdateView(_ context.Context, _ uuid.UUID, _ sprintdom.UpdateViewInput) (*sprintdom.SprintView, error) {
	return nil, sprintdom.ErrViewNotFound
}

func (f *fakeViewSvcTask) DeleteView(_ context.Context, _ uuid.UUID) error { return nil }

func (f *fakeViewSvcTask) MoveTask(_ context.Context, _ uuid.UUID, _ sprintdom.MoveTaskInput) error {
	return nil
}

func (f *fakeViewSvcTask) ListTaskPositions(_ context.Context, _ uuid.UUID) ([]*sprintdom.ViewTaskPosition, error) {
	return nil, nil
}

func (f *fakeViewSvcTask) ReorderViews(_ context.Context, _ uuid.UUID, _ []uuid.UUID) error {
	return nil
}

func (f *fakeViewSvcTask) ReorderBacklogViews(_ context.Context, _ uuid.UUID, _ []uuid.UUID) error {
	return nil
}

// ---------------------------------------------------------------------------
// Router helper
// ---------------------------------------------------------------------------

func buildTaskHandlerRouter(svc *fakeTaskSvc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := handler.NewTaskHandler(svc, &fakeViewSvcTask{})
	r := gin.New()
	projectGroup := r.Group("/projects/:projectId")
	projectGroup.GET("/task-types", h.ListTaskTypes)
	projectGroup.POST("/task-types", h.CreateTaskType)
	projectGroup.PATCH("/task-types/:typeId", h.UpdateTaskType)
	projectGroup.DELETE("/task-types/:typeId", h.DeleteTaskType)
	projectGroup.GET("/tasks", h.ListTasks)
	projectGroup.POST("/tasks", h.CreateTask)
	projectGroup.GET("/tasks/:taskId", h.GetTask)
	projectGroup.PATCH("/tasks/:taskId", h.UpdateTask)
	projectGroup.DELETE("/tasks/:taskId", h.DeleteTask)
	return r
}

func doTaskRequest(r *gin.Engine, method, path string, body any) *httptest.ResponseRecorder {
	var buf *bytes.Buffer
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewBuffer(b)
	} else {
		buf = bytes.NewBuffer(nil)
	}
	req := httptest.NewRequestWithContext(context.Background(), method, path, buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decodeTaskID(t *testing.T, body []byte) string {
	t.Helper()
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	id, _ := env.Data["id"].(string)
	if id == "" {
		t.Fatalf("missing id in response: %s", body)
	}
	return id
}

func decodeTaskField(t *testing.T, body []byte, field string) any {
	t.Helper()
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return env.Data[field]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestTaskHandler_CreateTask_Returns201(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	w := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/tasks", projectID),
		map[string]any{"title": "New Task"},
	)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	id := decodeTaskID(t, w.Body.Bytes())
	if id == "" {
		t.Error("expected non-empty id in response")
	}
}

func TestTaskHandler_CreateTask_EmptyTitleReturns400(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	w := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/tasks", projectID),
		map[string]any{"title": ""},
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTaskHandler_GetTask_Returns200(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()

	// Create first
	createW := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/tasks", projectID),
		map[string]any{"title": "Test Task"},
	)
	if createW.Code != http.StatusCreated {
		t.Fatalf("create: got %d", createW.Code)
	}
	taskID := decodeTaskID(t, createW.Body.Bytes())

	// Get by ID
	getW := doTaskRequest(r, http.MethodGet,
		fmt.Sprintf("/projects/%s/tasks/%s", projectID, taskID),
		nil,
	)
	if getW.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d: %s", getW.Code, getW.Body.String())
	}
	gotID := decodeTaskID(t, getW.Body.Bytes())
	if gotID != taskID {
		t.Errorf("expected id %s, got %s", taskID, gotID)
	}
}

func TestTaskHandler_GetTask_NotFoundReturns404(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	w := doTaskRequest(r, http.MethodGet,
		fmt.Sprintf("/projects/%s/tasks/%s", projectID, uuid.New()),
		nil,
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

// TestTaskHandler_UpdateTask_StatusOnlyPreservesSprintID verifies that a PATCH
// with only status_id does not clear other fields (the partial-update bug fix).
func TestTaskHandler_UpdateTask_StatusOnlyPreservesSprintID(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	sprintID := uuid.New()
	statusID := uuid.New()

	// Create a task assigned to a sprint.
	createW := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/tasks", projectID),
		map[string]any{
			"title":     "Sprint Task",
			"sprint_id": sprintID.String(),
		},
	)
	if createW.Code != http.StatusCreated {
		t.Fatalf("create: got %d", createW.Code)
	}
	taskID := decodeTaskID(t, createW.Body.Bytes())

	// PATCH with only status_id — sprint_id must not be cleared.
	patchW := doTaskRequest(r, http.MethodPatch,
		fmt.Sprintf("/projects/%s/tasks/%s", projectID, taskID),
		map[string]any{"status_id": statusID.String()},
	)
	if patchW.Code != http.StatusOK {
		t.Fatalf("patch: expected 200, got %d: %s", patchW.Code, patchW.Body.String())
	}
	gotSprintID := decodeTaskField(t, patchW.Body.Bytes(), "sprint_id")
	if gotSprintID != sprintID.String() {
		t.Errorf("expected sprint_id %s to be preserved, got %v", sprintID, gotSprintID)
	}
}

// TestTaskHandler_UpdateTask_NullSprintIDClearsField verifies that sending
// sprint_id=null explicitly removes the sprint assignment.
func TestTaskHandler_UpdateTask_NullSprintIDClearsField(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	sprintID := uuid.New()

	createW := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/tasks", projectID),
		map[string]any{"title": "Sprint Task", "sprint_id": sprintID.String()},
	)
	taskID := decodeTaskID(t, createW.Body.Bytes())

	// Send sprint_id: null explicitly.
	body := []byte(`{"sprint_id": null}`)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPatch,
		fmt.Sprintf("/projects/%s/tasks/%s", projectID, taskID),
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	gotSprintID := decodeTaskField(t, w.Body.Bytes(), "sprint_id")
	if gotSprintID != nil {
		t.Errorf("expected sprint_id=nil after explicit null, got %v", gotSprintID)
	}
}

func TestTaskHandler_DeleteTask_Returns200(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()

	createW := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/tasks", projectID),
		map[string]any{"title": "Delete Me"},
	)
	taskID := decodeTaskID(t, createW.Body.Bytes())

	delW := doTaskRequest(r, http.MethodDelete,
		fmt.Sprintf("/projects/%s/tasks/%s", projectID, taskID),
		nil,
	)
	if delW.Code != http.StatusOK {
		t.Fatalf("delete: expected 200, got %d: %s", delW.Code, delW.Body.String())
	}
}

func TestTaskHandler_DeleteTask_NotFoundReturns404(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	w := doTaskRequest(r, http.MethodDelete,
		fmt.Sprintf("/projects/%s/tasks/%s", projectID, uuid.New()),
		nil,
	)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTaskHandler_CreateTaskType_Returns201(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	w := doTaskRequest(r, http.MethodPost,
		fmt.Sprintf("/projects/%s/task-types", projectID),
		map[string]any{"name": "Bug"},
	)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTaskHandler_InvalidTaskID_Returns400(t *testing.T) {
	svc := newFakeTaskSvc()
	r := buildTaskHandlerRouter(svc)
	projectID := uuid.New()
	w := doTaskRequest(r, http.MethodGet,
		fmt.Sprintf("/projects/%s/tasks/not-a-uuid", projectID),
		nil,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid task id, got %d: %s", w.Code, w.Body.String())
	}
}
