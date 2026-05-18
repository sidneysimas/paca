// Package mention provides utilities for parsing BlockNote mentions.
package mention

import (
	"encoding/json"
)

// Type represents the different types of mentions that can be embedded
// in BlockNote content.
type Type string

const (
	// MentionTypeTeam represents @team member mentions.
	MentionTypeTeam Type = "teamMention"
	// MentionTypeTask represents #task references.
	MentionTypeTask Type = "taskReference"
	// MentionTypeDoc represents #document references.
	MentionTypeDoc Type = "docReference"
)

// Mention represents a single mention found in BlockNote content.
type Mention struct {
	Type Type   `json:"type"`
	ID   string `json:"id"`
	// Name is the display name (for team mentions) or title (for task/doc references).
	Name string `json:"name"`
	// For team mentions, this contains user_id.
	UserID string `json:"user_id,omitempty"`
}

// Block represents a single BlockNote block.
type Block struct {
	Content []InlineContent `json:"content"`
}

// InlineContent represents an inline content item in a BlockNote block.
type InlineContent struct {
	Type  string                 `json:"type"`
	Props map[string]interface{} `json:"props,omitempty"`
}

// ExtractMentionsFromBlocks parses BlockNote JSON and extracts all mentions.
// It returns team member mentions (@), task references (#), and document references (#).
func ExtractMentionsFromBlocks(raw json.RawMessage) []Mention {
	var blocks []Block
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return nil
	}

	var mentions []Mention
	for _, block := range blocks {
		for _, content := range block.Content {
			mention := extractFromInlineContent(content)
			if mention != nil {
				mentions = append(mentions, *mention)
			}
		}
	}
	return mentions
}

// ExtractTeamMentionsFromBlocks returns only team member (@) mentions.
func ExtractTeamMentionsFromBlocks(raw json.RawMessage) []Mention {
	allMentions := ExtractMentionsFromBlocks(raw)
	var teamMentions []Mention
	for _, m := range allMentions {
		if m.Type == MentionTypeTeam {
			teamMentions = append(teamMentions, m)
		}
	}
	return teamMentions
}

// extractFromInlineContent attempts to extract a mention from a single
// inline content item.
func extractFromInlineContent(content InlineContent) *Mention {
	props := content.Props
	switch content.Type {
	case "teamMention":
		if props != nil {
			return &Mention{
				Type: MentionTypeTeam,
				ID:   getStringProp(props, "id"),
				Name: getStringProp(props, "name"),
			}
		}
	case "taskReference":
		if props != nil {
			return &Mention{
				Type: MentionTypeTask,
				ID:   getStringProp(props, "id"),
				Name: getStringProp(props, "title"),
			}
		}
	case "docReference":
		if props != nil {
			return &Mention{
				Type: MentionTypeDoc,
				ID:   getStringProp(props, "id"),
				Name: getStringProp(props, "title"),
			}
		}
	}
	return nil
}

// getStringProp safely extracts a string property from a props map.
func getStringProp(props map[string]interface{}, key string) string {
	if val, ok := props[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}
