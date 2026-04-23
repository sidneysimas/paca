// Package apikeydom provides domain entities for API key management.
package apikeydom

import (
	"time"

	"github.com/google/uuid"
)

// APIKey represents a user-created API key used for programmatic authentication.
// The raw key value is never stored; only key_hash (SHA-256 hex) and key_prefix
// (first 8 hex chars) are persisted.
type APIKey struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	Name       string
	KeyPrefix  string
	LastUsedAt *time.Time
	ExpiresAt  *time.Time
	CreatedAt  time.Time
	RevokedAt  *time.Time
}

// IsActive reports whether the key can be used for authentication.
func (k *APIKey) IsActive() bool {
	if k.RevokedAt != nil {
		return false
	}
	if k.ExpiresAt != nil && time.Now().After(*k.ExpiresAt) {
		return false
	}
	return true
}
