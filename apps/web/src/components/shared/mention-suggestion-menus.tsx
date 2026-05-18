import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
	type DefaultReactSuggestionItem,
	SuggestionMenuController,
} from "@blocknote/react";

interface MentionSuggestionMenuProps {
	editor: {
		insertInlineContent: (content: unknown[]) => void;
	};
	teamMembers: Array<{
		id: string;
		name: string;
		username: string;
		avatar?: string | null | undefined;
	}>;
	tasks: Array<{ id: string; title: string; task_number: number }>;
	documents: Array<{ id: string; title: string }>;
}

export function MentionSuggestionMenus({
	editor,
	teamMembers,
	tasks,
	documents,
}: MentionSuggestionMenuProps) {
	const getTeamMentionItems = (): DefaultReactSuggestionItem[] => {
		return teamMembers.map((member) => ({
			title: member.name,
			subtext: `@${member.username}`,
			onItemClick: () => {
				editor.insertInlineContent([
					{
						type: "teamMention",
						props: {
							id: member.id,
							name: member.name,
							avatar: member.avatar,
						},
					},
					" ",
				]);
			},
		}));
	};

	const getTaskReferenceItems = (): DefaultReactSuggestionItem[] => {
		return tasks.map((task) => ({
			title: task.title,
			subtext: `#${task.task_number}`,
			onItemClick: () => {
				editor.insertInlineContent([
					{
						type: "taskReference",
						props: {
							id: task.id,
							title: task.title,
							status: "open",
						},
					},
					" ",
				]);
			},
		}));
	};

	const getDocReferenceItems = (): DefaultReactSuggestionItem[] => {
		return documents.map((doc) => ({
			title: doc.title,
			subtext: `#${doc.id.slice(0, 8)}`,
			onItemClick: () => {
				editor.insertInlineContent([
					{
						type: "docReference",
						props: {
							id: doc.id,
							title: doc.title,
						},
					},
					" ",
				]);
			},
		}));
	};

	return (
		<>
			<SuggestionMenuController
				triggerCharacter="@"
				getItems={async (query) =>
					filterSuggestionItems(getTeamMentionItems(), query)
				}
			/>
			<SuggestionMenuController
				triggerCharacter="#"
				getItems={async (query) => [
					...filterSuggestionItems(getTaskReferenceItems(), query),
					...filterSuggestionItems(getDocReferenceItems(), query),
				]}
			/>
		</>
	);
}
