package dto

import (
	"time"

	"github.com/google/uuid"
	taskdom "github.com/paca/api/internal/domain/task"
)

// --- Task Type DTOs ---------------------------------------------------------

// CreateTaskTypeRequest is the body for POST /projects/:projectId/task-types.
type CreateTaskTypeRequest struct {
	Name        string  `json:"name" binding:"required"`
	Icon        *string `json:"icon"`
	Color       *string `json:"color"`
	Description *string `json:"description"`
}

// UpdateTaskTypeRequest is the body for PATCH /projects/:projectId/task-types/:typeId.
type UpdateTaskTypeRequest struct {
	Name        string  `json:"name"`
	Icon        *string `json:"icon"`
	Color       *string `json:"color"`
	Description *string `json:"description"`
}

// TaskTypeResponse is the public representation of a task type.
type TaskTypeResponse struct {
	ID          uuid.UUID `json:"id"`
	ProjectID   uuid.UUID `json:"project_id"`
	Name        string    `json:"name"`
	Icon        *string   `json:"icon,omitempty"`
	Color       *string   `json:"color,omitempty"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TaskTypeFromEntity maps a domain TaskType to a TaskTypeResponse DTO.
func TaskTypeFromEntity(t *taskdom.TaskType) TaskTypeResponse {
	return TaskTypeResponse{
		ID:          t.ID,
		ProjectID:   t.ProjectID,
		Name:        t.Name,
		Icon:        t.Icon,
		Color:       t.Color,
		Description: t.Description,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	}
}

// --- Task Status DTOs -------------------------------------------------------

// CreateTaskStatusRequest is the body for POST /projects/:projectId/task-statuses.
type CreateTaskStatusRequest struct {
	Name     string                 `json:"name" binding:"required"`
	Color    *string                `json:"color"`
	Position int                    `json:"position"`
	Category taskdom.StatusCategory `json:"category" binding:"required"`
}

// UpdateTaskStatusRequest is the body for PATCH /projects/:projectId/task-statuses/:statusId.
type UpdateTaskStatusRequest struct {
	Name     string                  `json:"name"`
	Color    *string                 `json:"color"`
	Position *int                    `json:"position"`
	Category *taskdom.StatusCategory `json:"category"`
}

// TaskStatusResponse is the public representation of a task status.
type TaskStatusResponse struct {
	ID        uuid.UUID              `json:"id"`
	ProjectID uuid.UUID              `json:"project_id"`
	Name      string                 `json:"name"`
	Color     *string                `json:"color,omitempty"`
	Position  int                    `json:"position"`
	Category  taskdom.StatusCategory `json:"category"`
	CreatedAt time.Time              `json:"created_at"`
	UpdatedAt time.Time              `json:"updated_at"`
}

// TaskStatusFromEntity maps a domain TaskStatus to a TaskStatusResponse DTO.
func TaskStatusFromEntity(s *taskdom.TaskStatus) TaskStatusResponse {
	return TaskStatusResponse{
		ID:        s.ID,
		ProjectID: s.ProjectID,
		Name:      s.Name,
		Color:     s.Color,
		Position:  s.Position,
		Category:  s.Category,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
	}
}

// --- Task DTOs --------------------------------------------------------------

// CreateTaskRequest is the body for POST /projects/:projectId/tasks.
type CreateTaskRequest struct {
	Title        string         `json:"title"`
	TaskTypeID   *uuid.UUID     `json:"task_type_id"`
	StatusID     *uuid.UUID     `json:"status_id"`
	SprintID     *uuid.UUID     `json:"sprint_id"`
	ParentTaskID *uuid.UUID     `json:"parent_task_id"`
	Description  *string        `json:"description"`
	Importance   int            `json:"importance"`
	AssigneeID   *uuid.UUID     `json:"assignee_id"`
	ReporterID   *uuid.UUID     `json:"reporter_id"`
	CustomFields map[string]any `json:"custom_fields"`
	StartDate    *time.Time     `json:"start_date"`
	DueDate      *time.Time     `json:"due_date"`
	Tags         []string       `json:"tags"`
}

// UpdateTaskRequest is the body for PATCH /projects/:projectId/tasks/:taskId.
type UpdateTaskRequest struct {
	Title        string         `json:"title"`
	TaskTypeID   *uuid.UUID     `json:"task_type_id"`
	StatusID     *uuid.UUID     `json:"status_id"`
	SprintID     *uuid.UUID     `json:"sprint_id"`
	ParentTaskID *uuid.UUID     `json:"parent_task_id"`
	Description  *string        `json:"description"`
	Importance   *int           `json:"importance"`
	AssigneeID   *uuid.UUID     `json:"assignee_id"`
	ReporterID   *uuid.UUID     `json:"reporter_id"`
	CustomFields map[string]any `json:"custom_fields"`
	StartDate    *time.Time     `json:"start_date"`
	DueDate      *time.Time     `json:"due_date"`
	Tags         []string       `json:"tags"`
}

// TaskResponse is the public representation of a task.
// ViewPosition and ViewGroupKey are only populated when the caller supplies a
// valid view_id query parameter on list endpoints; they reflect the task's
// manual position within that view.
type TaskResponse struct {
	ID           uuid.UUID      `json:"id"`
	ProjectID    uuid.UUID      `json:"project_id"`
	Title        string         `json:"title"`
	TaskTypeID   *uuid.UUID     `json:"task_type_id,omitempty"`
	StatusID     *uuid.UUID     `json:"status_id,omitempty"`
	SprintID     *uuid.UUID     `json:"sprint_id,omitempty"`
	ParentTaskID *uuid.UUID     `json:"parent_task_id,omitempty"`
	Description  *string        `json:"description,omitempty"`
	Importance   int            `json:"importance"`
	AssigneeID   *uuid.UUID     `json:"assignee_id,omitempty"`
	ReporterID   *uuid.UUID     `json:"reporter_id,omitempty"`
	CustomFields map[string]any `json:"custom_fields"`
	StartDate    *time.Time     `json:"start_date,omitempty"`
	DueDate      *time.Time     `json:"due_date,omitempty"`
	Tags         []string       `json:"tags"`
	ViewPosition *int           `json:"view_position,omitempty"`
	ViewGroupKey *string        `json:"view_group_key,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

// TaskFromEntity maps a domain Task to a TaskResponse DTO.
func TaskFromEntity(t *taskdom.Task) TaskResponse {
	cf := t.CustomFields
	if cf == nil {
		cf = map[string]any{}
	}
	tags := t.Tags
	if tags == nil {
		tags = []string{}
	}
	return TaskResponse{
		ID:           t.ID,
		ProjectID:    t.ProjectID,
		Title:        t.Title,
		TaskTypeID:   t.TaskTypeID,
		StatusID:     t.StatusID,
		SprintID:     t.SprintID,
		ParentTaskID: t.ParentTaskID,
		Description:  t.Description,
		Importance:   t.Importance,
		AssigneeID:   t.AssigneeID,
		ReporterID:   t.ReporterID,
		CustomFields: cf,
		StartDate:    t.StartDate,
		DueDate:      t.DueDate,
		Tags:         tags,
		CreatedAt:    t.CreatedAt,
		UpdatedAt:    t.UpdatedAt,
	}
}

// --- Custom Field Definition DTOs ------------------------------------------

// CreateCustomFieldDefinitionRequest is the body for
// POST /projects/:projectId/custom-fields.
type CreateCustomFieldDefinitionRequest struct {
	FieldKey    string            `json:"field_key" binding:"required"`
	DisplayName string            `json:"display_name" binding:"required"`
	FieldType   taskdom.FieldType `json:"field_type" binding:"required"`
	Options     []string          `json:"options"`
	IsRequired  bool              `json:"is_required"`
}

// UpdateCustomFieldDefinitionRequest is the body for
// PATCH /projects/:projectId/custom-fields/:fieldId.
type UpdateCustomFieldDefinitionRequest struct {
	DisplayName string             `json:"display_name"`
	FieldType   *taskdom.FieldType `json:"field_type"`
	Options     []string           `json:"options"`
	IsRequired  *bool              `json:"is_required"`
}

// CustomFieldDefinitionResponse is the public representation of a custom
// field definition.
type CustomFieldDefinitionResponse struct {
	ID          uuid.UUID         `json:"id"`
	ProjectID   uuid.UUID         `json:"project_id"`
	FieldKey    string            `json:"field_key"`
	DisplayName string            `json:"display_name"`
	FieldType   taskdom.FieldType `json:"field_type"`
	Options     []string          `json:"options"`
	IsRequired  bool              `json:"is_required"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// CustomFieldDefinitionFromEntity maps a domain CustomFieldDefinition to a DTO.
func CustomFieldDefinitionFromEntity(f *taskdom.CustomFieldDefinition) CustomFieldDefinitionResponse {
	opts := f.Options
	if opts == nil {
		opts = []string{}
	}
	return CustomFieldDefinitionResponse{
		ID:          f.ID,
		ProjectID:   f.ProjectID,
		FieldKey:    f.FieldKey,
		DisplayName: f.DisplayName,
		FieldType:   f.FieldType,
		Options:     opts,
		IsRequired:  f.IsRequired,
		CreatedAt:   f.CreatedAt,
		UpdatedAt:   f.UpdatedAt,
	}
}
