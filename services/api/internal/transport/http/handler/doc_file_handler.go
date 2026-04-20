package handler

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/paca/api/internal/apierr"
	attachmentdom "github.com/paca/api/internal/domain/attachment"
	"github.com/paca/api/internal/transport/http/dto"
	"github.com/paca/api/internal/transport/http/middleware"
	"github.com/paca/api/internal/transport/http/presenter"
)

// DocFileHandler handles file upload/download endpoints for documents.
type DocFileHandler struct {
	svc attachmentdom.DocFileService
}

// NewDocFileHandler returns a DocFileHandler wired to the doc file service.
func NewDocFileHandler(svc attachmentdom.DocFileService) *DocFileHandler {
	return &DocFileHandler{svc: svc}
}

// InitiateDocUpload handles POST /projects/:projectId/docs/:docId/files/initiate-upload.
// Creates a pending file record and returns presigned upload URL(s).
func (h *DocFileHandler) InitiateDocUpload(c *gin.Context) {
	docID, err := parseDocID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}

	var req dto.InitiateUploadRequest
	if !middleware.BindJSON(c, &req) {
		return
	}

	claims := middleware.ClaimsFrom(c)
	if claims == nil {
		presenter.Error(c, apierr.New(apierr.CodeUnauthenticated, "unauthenticated"))
		return
	}
	uploaderID, err := uuid.Parse(claims.Subject)
	if err != nil {
		presenter.Error(c, apierr.New(apierr.CodeUnauthenticated, "invalid subject in token"))
		return
	}

	session, err := h.svc.InitiateDocUpload(c.Request.Context(), attachmentdom.DocUploadInput{
		DocID:       docID,
		FileName:    req.FileName,
		ContentType: req.ContentType,
		FileSize:    req.FileSize,
		UploadedBy:  uploaderID,
	})
	if err != nil {
		presenter.Error(c, err)
		return
	}

	presenter.Created(c, dto.UploadSessionFromDomain(session))
}

// CompleteDocUpload handles POST /projects/:projectId/docs/:docId/files/complete-upload.
// Marks the file as uploaded and returns the file metadata.
func (h *DocFileHandler) CompleteDocUpload(c *gin.Context) {
	var req dto.CompleteUploadRequest
	if !middleware.BindJSON(c, &req) {
		return
	}

	parts := make([]attachmentdom.CompletedPart, 0, len(req.Parts))
	for _, p := range req.Parts {
		parts = append(parts, attachmentdom.CompletedPart{
			PartNumber: p.PartNumber,
			ETag:       p.ETag,
		})
	}

	f, err := h.svc.CompleteDocUpload(c.Request.Context(), attachmentdom.DocCompleteUploadInput{
		FileID:   req.FileID,
		UploadID: req.UploadID,
		Parts:    parts,
	})
	if err != nil {
		presenter.Error(c, err)
		return
	}

	presenter.Created(c, dto.FileFromEntity(f))
}

// GetDocFileDownloadURL handles GET /projects/:projectId/docs/:docId/files/:fileId/download-url.
// Returns a short-lived presigned URL valid for 15 minutes.
func (h *DocFileHandler) GetDocFileDownloadURL(c *gin.Context) {
	docID, err := parseDocID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}
	fileID, err := parseDocFileID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}

	url, err := h.svc.GetDocFileDownloadURL(c.Request.Context(), docID, fileID, 15*time.Minute)
	if err != nil {
		presenter.Error(c, err)
		return
	}

	presenter.OK(c, dto.DownloadURLResponse{URL: url})
}

// DeleteDocFile handles DELETE /projects/:projectId/docs/:docId/files/:fileId.
func (h *DocFileHandler) DeleteDocFile(c *gin.Context) {
	docID, err := parseDocID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}
	fileID, err := parseDocFileID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}

	if err := h.svc.DeleteDocFile(c.Request.Context(), docID, fileID); err != nil {
		presenter.Error(c, err)
		return
	}

	presenter.NoContent(c)
}

// --- helpers ----------------------------------------------------------------

func parseDocFileID(c *gin.Context) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Param("fileId"))
	if err != nil {
		return uuid.Nil, apierr.New(apierr.CodeBadRequest, "invalid file id")
	}
	return id, nil
}
