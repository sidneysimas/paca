import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import {
	DocumentationReference,
	TaskReference,
	TeamMention,
} from "./blocknote-inline-contents";

export const customSchema = BlockNoteSchema.create({
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		teamMention: TeamMention,
		taskReference: TaskReference,
		docReference: DocumentationReference,
	},
});
