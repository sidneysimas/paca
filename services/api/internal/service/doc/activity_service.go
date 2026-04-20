package docsvc

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	docdom "github.com/paca/api/internal/domain/doc"
	projectdom "github.com/paca/api/internal/domain/project"
	"github.com/paca/api/internal/events"
	"github.com/paca/api/internal/platform/messaging"
)

// memberLookup is the minimal interface ActivitySvc needs to resolve a user
// UUID to a project member UUID.
type memberLookup interface {
	FindMemberByUserProject(ctx context.Context, userID, projectID uuid.UUID) (*projectdom.ProjectMember, error)
}

// ActivitySvc implements docdom.ActivityService (which includes
// docdom.ActivityRecorder via embedding).
type ActivitySvc struct {
	repo       docdom.ActivityRepository
	memberRepo memberLookup
	publisher  *messaging.Publisher
}

// NewActivityService creates a new ActivitySvc backed by repo.
// memberRepo is used to resolve user UUIDs to project-member UUIDs for comment
// operations; if nil, comment operations (AddComment, UpdateComment,
// DeleteComment) will return ErrMemberNotFound.
// publisher may be nil; stream events are then skipped silently.
func NewActivityService(repo docdom.ActivityRepository, memberRepo memberLookup, publisher *messaging.Publisher) *ActivitySvc {
	return &ActivitySvc{repo: repo, memberRepo: memberRepo, publisher: publisher}
}

// --- ActivityRecorder -------------------------------------------------------

// RecordActivity publishes a system-generated activity event to the Valkey
// stream (StreamDocActivities). The DocActivityConsumer worker reads that
// stream and writes the entry to the database, so this method intentionally
// does NOT touch the database itself.
func (s *ActivitySvc) RecordActivity(ctx context.Context, in docdom.RecordActivityInput) error {
	now := time.Now()
	content := in.Content
	if len(content) == 0 {
		content = json.RawMessage("{}")
	}
	a := &docdom.Activity{
		ID:           uuid.New(),
		DocumentID:   in.DocumentID,
		ActorID:      in.ActorID,
		ActivityType: in.ActivityType,
		Content:      content,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.publishToActivityStream(ctx, a, in.ProjectID)
	return nil
}

// --- ActivityService --------------------------------------------------------

// ListActivities returns all non-deleted activities for a document, oldest first.
func (s *ActivitySvc) ListActivities(ctx context.Context, documentID uuid.UUID) ([]*docdom.Activity, error) {
	return s.repo.ListActivities(ctx, documentID)
}

// AddComment creates a user comment on the document.
func (s *ActivitySvc) AddComment(ctx context.Context, in docdom.AddCommentInput) (*docdom.Activity, error) {
	text := strings.TrimSpace(in.Text)
	if text == "" {
		return nil, docdom.ErrCommentTextInvalid
	}
	if s.memberRepo == nil {
		return nil, projectdom.ErrMemberNotFound
	}
	member, err := s.memberRepo.FindMemberByUserProject(ctx, in.ActorID, in.ProjectID)
	if err != nil {
		return nil, err
	}
	content, _ := json.Marshal(map[string]string{"text": text})
	now := time.Now()
	a := &docdom.Activity{
		ID:           uuid.New(),
		DocumentID:   in.DocumentID,
		ActorID:      &member.ID,
		ActivityType: docdom.ActivityTypeComment,
		Content:      content,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.repo.CreateActivity(ctx, a); err != nil {
		return nil, err
	}
	s.publishRealtimeOnly(ctx, events.TopicDocCommentAdded, activityPayload(a, in.ProjectID))
	return a, nil
}

// UpdateComment edits the text of an existing comment.
func (s *ActivitySvc) UpdateComment(ctx context.Context, id uuid.UUID, projectID uuid.UUID, actorID uuid.UUID, text string) (*docdom.Activity, error) {
	a, err := s.repo.FindActivityByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if a.ActivityType != docdom.ActivityTypeComment {
		return nil, docdom.ErrActivityNotAComment
	}

	if s.memberRepo == nil {
		return nil, projectdom.ErrMemberNotFound
	}
	member, err := s.memberRepo.FindMemberByUserProject(ctx, actorID, projectID)
	if err != nil {
		return nil, err
	}
	if a.ActorID == nil || *a.ActorID != member.ID {
		return nil, docdom.ErrActivityForbidden
	}

	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, docdom.ErrCommentTextInvalid
	}
	content, _ := json.Marshal(map[string]string{"text": trimmed})
	a.Content = content
	a.UpdatedAt = time.Now()
	if err := s.repo.UpdateActivity(ctx, a); err != nil {
		return nil, err
	}
	s.publishRealtimeOnly(ctx, events.TopicDocCommentUpdated, activityPayload(a, uuid.Nil))
	return a, nil
}

// DeleteComment soft-deletes a comment.
func (s *ActivitySvc) DeleteComment(ctx context.Context, id uuid.UUID, projectID uuid.UUID, actorID uuid.UUID) error {
	a, err := s.repo.FindActivityByID(ctx, id)
	if err != nil {
		return err
	}
	if a.ActivityType != docdom.ActivityTypeComment {
		return docdom.ErrActivityNotAComment
	}

	if s.memberRepo == nil {
		return projectdom.ErrMemberNotFound
	}
	member, err := s.memberRepo.FindMemberByUserProject(ctx, actorID, projectID)
	if err != nil {
		return err
	}
	if a.ActorID == nil || *a.ActorID != member.ID {
		return docdom.ErrActivityForbidden
	}

	if err := s.repo.DeleteActivity(ctx, id); err != nil {
		return err
	}
	s.publishRealtimeOnly(ctx, events.TopicDocCommentDeleted, map[string]any{
		"id":          id,
		"document_id": a.DocumentID,
		"actor_id":    actorID,
	})
	return nil
}

// --- helpers ----------------------------------------------------------------

// activityPayload builds the full stream message body for a doc activity.
// projectID is included so the consumer can resolve the actor (user UUID) to
// the correct project_members.id.
func activityPayload(a *docdom.Activity, projectID uuid.UUID) map[string]any {
	p := map[string]any{
		"id":            a.ID,
		"document_id":   a.DocumentID,
		"project_id":    projectID,
		"activity_type": string(a.ActivityType),
		"content":       string(a.Content),
		"created_at":    a.CreatedAt,
		"updated_at":    a.UpdatedAt,
	}
	if a.ActorID != nil {
		p["actor_id"] = a.ActorID.String()
	}
	return p
}

// publishToActivityStream appends the activity to the dedicated doc-activity
// Valkey stream and also broadcasts a real-time pub/sub notification.
// Errors are intentionally swallowed — a messaging failure must not block
// the primary HTTP response.
func (s *ActivitySvc) publishToActivityStream(ctx context.Context, a *docdom.Activity, projectID uuid.UUID) {
	if s.publisher == nil {
		return
	}
	payload := activityPayload(a, projectID)
	_ = s.publisher.Append(ctx, events.StreamDocActivities, string(a.ActivityType), payload)
	_ = s.publisher.Publish(ctx, events.ChannelRealtime, map[string]any{
		"type":    string(a.ActivityType),
		"payload": payload,
	})
}

// publishRealtimeOnly sends a real-time pub/sub notification without writing
// to any stream.  Used for comment operations that already write to the DB
// directly and don't need the consumer-persistence path.
func (s *ActivitySvc) publishRealtimeOnly(ctx context.Context, topic string, payload any) {
	if s.publisher == nil {
		return
	}
	_ = s.publisher.Publish(ctx, events.ChannelRealtime, map[string]any{
		"type":    topic,
		"payload": payload,
	})
}
