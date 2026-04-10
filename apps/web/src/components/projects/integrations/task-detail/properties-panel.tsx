import {
	ArrowRight,
	CalendarDays,
	Check,
	Clock,
	GitBranch,
	Link2,
	Minus,
	Plus,
	User,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Sprint, Task } from "@/lib/integration-api";
import type { ProjectMember, TaskStatus, TaskType } from "@/lib/project-api";
import { getTaskTypeIconComponent } from "../../task-types/task-type-icons";
import type { PriorityMeta } from "../priority";
import { AddFieldDialog } from "./add-field-dialog";
import { FieldRow, FieldValue } from "./primitives";
import type { CustomFieldDef } from "./types";

type UpdatePayload = Partial<{
	status_id: string | null;
	task_type_id: string | null;
	assignee_id: string | null;
	reporter_id: string | null;
	importance: number;
	start_date: string | null;
	due_date: string | null;
	tags: string[];
	sprint_id: string | null;
}>;

function toDateInput(iso?: string | null) {
	if (!iso) return "";
	return iso.substring(0, 10);
}

function displayDate(iso?: string | null) {
	if (!iso) return null;
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

interface PropertiesPanelProps {
	task: Task;
	status: TaskStatus | undefined;
	taskType: TaskType | undefined;
	priority: PriorityMeta;
	assignee: ProjectMember | undefined;
	reporter: ProjectMember | undefined;
	statuses?: TaskStatus[];
	taskTypes?: TaskType[];
	members?: ProjectMember[];
	sprints?: Sprint[];
	initialCustomFields?: CustomFieldDef[];
	canEdit?: boolean;
	onUpdate?: (payload: UpdatePayload) => void;
}

export function PropertiesPanel({
	task,
	status,
	taskType,
	assignee,
	reporter,
	statuses = [],
	taskTypes = [],
	members = [],
	sprints = [],
	initialCustomFields = [],
	canEdit = true,
	onUpdate,
}: PropertiesPanelProps) {
	const [localCustomFields, setLocalCustomFields] =
		useState<CustomFieldDef[]>(initialCustomFields);
	const [addFieldOpen, setAddFieldOpen] = useState(false);
	const [tagInput, setTagInput] = useState("");
	const [importanceValue, setImportanceValue] = useState(task.importance ?? 0);
	const tagRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setLocalCustomFields(initialCustomFields);
	}, [initialCustomFields]);

	useEffect(() => {
		setImportanceValue(task.importance ?? 0);
	}, [task.importance]);

	const localTags: string[] = task.tags ?? [];

	function handleAddTag(tag: string) {
		const trimmed = tag.trim();
		if (!trimmed || localTags.includes(trimmed)) return;
		onUpdate?.({ tags: [...localTags, trimmed] });
		setTagInput("");
	}

	function handleRemoveTag(tag: string) {
		onUpdate?.({ tags: localTags.filter((t) => t !== tag) });
	}

	return (
		<>
			<div className="divide-y divide-border/20 rounded-xl border border-border/30 bg-card/50 px-4 py-0.5">
				{/* Status */}
				<FieldRow label="Status">
					{canEdit && statuses.length > 0 ? (
						<Popover>
							<PopoverTrigger
								type="button"
								className={
									status
										? "inline-flex items-center gap-2 rounded-full border border-border/30 bg-muted/30 px-3 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-muted/50 hover:border-border/50 transition-all duration-150"
										: "inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/50 italic hover:text-muted-foreground/80 transition-colors"
								}
							>
								{status ? (
									<>
										<span
											className="size-[7px] rounded-full shrink-0"
											style={{
												background: status.color ?? "var(--muted-foreground)",
												boxShadow: `0 0 6px ${status.color ?? "var(--muted-foreground)"}30`,
											}}
										/>
										{status.name}
									</>
								) : (
									"No status"
								)}
							</PopoverTrigger>
							<PopoverContent
								className="w-52 p-1 rounded-xl border border-border/40 shadow-lg"
								align="start"
							>
								{statuses.map((s) => (
									<button
										key={s.id}
										type="button"
										className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
										onClick={() => onUpdate?.({ status_id: s.id })}
									>
										<span
											className="size-2 rounded-full shrink-0"
											style={{
												background: s.color ?? "var(--muted-foreground)",
											}}
										/>
										<span className="flex-1 text-left">{s.name}</span>
										{s.id === status?.id && (
											<Check className="size-3.5 text-primary" />
										)}
									</button>
								))}
							</PopoverContent>
						</Popover>
					) : status ? (
						<button
							type="button"
							className="inline-flex items-center gap-2 rounded-full border border-border/30 bg-muted/30 px-3 py-1 text-[12px] font-semibold text-muted-foreground"
						>
							<span
								className="size-[7px] rounded-full shrink-0"
								style={{
									background: status.color ?? "var(--muted-foreground)",
								}}
							/>
							{status.name}
						</button>
					) : (
						<FieldValue empty />
					)}
				</FieldRow>

				{/* Dates */}
				<FieldRow label="Dates">
					<div className="flex items-center gap-2 flex-wrap">
						{canEdit ? (
							<>
								<label className="inline-flex items-center gap-1.5 rounded-lg border border-border/25 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-border/50 hover:bg-muted/40 transition-all duration-150 cursor-pointer font-medium">
									<CalendarDays className="size-3 shrink-0 opacity-70" />
									<span>{displayDate(task.start_date) ?? "Start date"}</span>
									<input
										type="date"
										className="sr-only"
										value={toDateInput(task.start_date)}
										onChange={(e) =>
											onUpdate?.({ start_date: e.target.value || null })
										}
									/>
								</label>
								<Minus className="size-3 text-border/40 shrink-0" />
								<label className="inline-flex items-center gap-1.5 rounded-lg border border-border/25 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-border/50 hover:bg-muted/40 transition-all duration-150 cursor-pointer font-medium">
									<CalendarDays className="size-3 shrink-0 opacity-70" />
									<span>{displayDate(task.due_date) ?? "Due date"}</span>
									<input
										type="date"
										className="sr-only"
										value={toDateInput(task.due_date)}
										onChange={(e) =>
											onUpdate?.({ due_date: e.target.value || null })
										}
									/>
								</label>
							</>
						) : (
							<>
								<span className="inline-flex items-center gap-1.5 rounded-lg border border-border/25 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground font-medium">
									<CalendarDays className="size-3 shrink-0 opacity-70" />
									{displayDate(task.start_date) ?? "Start date"}
								</span>
								<Minus className="size-3 text-border/40 shrink-0" />
								<span className="inline-flex items-center gap-1.5 rounded-lg border border-border/25 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground font-medium">
									<CalendarDays className="size-3 shrink-0 opacity-70" />
									{displayDate(task.due_date) ?? "Due date"}
								</span>
							</>
						)}
					</div>
				</FieldRow>

				{/* Track Time */}
				<FieldRow label="Track Time">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors duration-150 font-medium"
					>
						<Clock className="size-3.5 opacity-70" />
						Add time
					</button>
				</FieldRow>

				{/* Type */}
				{(taskType || (canEdit && taskTypes.length > 0)) && (
					<FieldRow label="Type">
						{canEdit && taskTypes.length > 0 ? (
							<Popover>
								<PopoverTrigger
									type="button"
									className="inline-flex items-center gap-1.5 rounded-lg border border-border/25 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-border/50 hover:bg-muted/40 transition-all duration-150 font-medium"
								>
									{(() => {
										const Ic = taskType
											? getTaskTypeIconComponent(taskType.icon)
											: null;
										return Ic ? (
											<span className="text-muted-foreground/80">
												<Ic className="size-3.5" />
											</span>
										) : null;
									})()}
									{taskType?.name ?? "No type"}
								</PopoverTrigger>
								<PopoverContent
									className="w-48 p-1 rounded-xl border border-border/40 shadow-lg"
									align="start"
								>
									{taskTypes.map((tt) => {
										const TtIcon = getTaskTypeIconComponent(tt.icon);
										return (
											<button
												key={tt.id}
												type="button"
												className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
												onClick={() => onUpdate?.({ task_type_id: tt.id })}
											>
												{TtIcon && (
													<TtIcon className="size-3.5 text-muted-foreground/80 shrink-0" />
												)}
												<span className="flex-1 text-left">{tt.name}</span>
												{tt.id === taskType?.id && (
													<Check className="size-3.5 text-primary" />
												)}
											</button>
										);
									})}
								</PopoverContent>
							</Popover>
						) : (
							<FieldValue>{taskType?.name}</FieldValue>
						)}
					</FieldRow>
				)}

				{/* Relationships */}
				<FieldRow label="Relationships">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors duration-150 font-medium"
					>
						<Link2 className="size-3.5 opacity-70" />
						<FieldValue empty />
					</button>
				</FieldRow>

				{/* Assignees */}
				<FieldRow label="Assignees">
					{canEdit && members.length > 0 ? (
						<Popover>
							<PopoverTrigger
								type="button"
								className={
									assignee
										? "flex items-center gap-2.5 hover:opacity-80 transition-opacity duration-150"
										: "inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/50 italic hover:text-muted-foreground/80 transition-colors"
								}
							>
								{assignee ? (
									<>
										<div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-[10px] font-bold ring-1 ring-primary/20">
											{(assignee.full_name || assignee.username)
												.slice(0, 1)
												.toUpperCase()}
										</div>
										<span className="text-[13px] font-medium text-foreground">
											{assignee.full_name || assignee.username}
										</span>
									</>
								) : (
									<>
										<User className="size-3.5 opacity-60" />
										Unassigned
									</>
								)}
							</PopoverTrigger>
							<PopoverContent
								className="w-56 p-1 rounded-xl border border-border/40 shadow-lg"
								align="start"
							>
								<button
									type="button"
									className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 transition-colors duration-100"
									onClick={() => onUpdate?.({ assignee_id: null })}
								>
									<User className="size-3.5 opacity-60" />
									<span className="flex-1 text-left">Unassigned</span>
									{!assignee && <Check className="size-3.5 text-primary" />}
								</button>
								{members.map((m) => (
									<button
										key={m.user_id}
										type="button"
										className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
										onClick={() => onUpdate?.({ assignee_id: m.user_id })}
									>
										<div className="flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-[9px] font-bold">
											{(m.full_name || m.username).slice(0, 1).toUpperCase()}
										</div>
										<span className="flex-1 text-left truncate">
											{m.full_name || m.username}
										</span>
										{m.user_id === assignee?.user_id && (
											<Check className="size-3.5 text-primary" />
										)}
									</button>
								))}
							</PopoverContent>
						</Popover>
					) : assignee ? (
						<div className="flex items-center gap-2.5">
							<div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-[10px] font-bold ring-1 ring-primary/20">
								{(assignee.full_name || assignee.username)
									.slice(0, 1)
									.toUpperCase()}
							</div>
							<span className="text-[13px] font-medium text-foreground">
								{assignee.full_name || assignee.username}
							</span>
						</div>
					) : (
						<button
							type="button"
							className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/50 italic hover:text-muted-foreground/80 transition-colors"
						>
							<User className="size-3.5 opacity-60" />
							Unassigned
						</button>
					)}
				</FieldRow>

				{/* Importance */}
				<FieldRow label="Importance">
					{canEdit ? (
						<input
							type="number"
							min="0"
							value={importanceValue}
							onChange={(e) =>
								setImportanceValue(Math.max(0, Number(e.target.value)))
							}
							onBlur={() => {
								const val = Math.max(0, importanceValue);
								if (val !== (task.importance ?? 0))
									onUpdate?.({ importance: val });
							}}
							className="w-16 rounded-lg border border-border/30 bg-muted/25 px-2.5 py-1 text-[13px] text-center tabular-nums font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all duration-150"
						/>
					) : (
						<span className="text-[13px] tabular-nums font-medium text-foreground">
							{task.importance ?? 0}
						</span>
					)}
				</FieldRow>

				{/* Tags */}
				<FieldRow label="Tags">
					<div className="flex flex-wrap items-center gap-1.5 min-h-[1.75rem]">
						{localTags.map((tag) => (
							<span
								key={tag}
								className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80 border border-border/20 hover:border-border/40 transition-colors duration-150"
							>
								{tag}
								{canEdit && (
									<button
										type="button"
										onClick={() => handleRemoveTag(tag)}
										className="text-muted-foreground/60 hover:text-destructive transition-colors duration-150"
									>
										<X className="size-2.5" />
									</button>
								)}
							</span>
						))}
						{canEdit && (
							<Popover>
								<PopoverTrigger
									type="button"
									className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/30 px-2 py-0.5 text-[11px] text-muted-foreground/60 hover:border-border/60 hover:text-muted-foreground transition-all duration-150"
								>
									<Plus className="size-2.5" />
									Add tag
								</PopoverTrigger>
								<PopoverContent
									className="w-52 p-2 rounded-xl border border-border/40 shadow-lg"
									align="start"
								>
									<form
										onSubmit={(e) => {
											e.preventDefault();
											handleAddTag(tagInput);
										}}
									>
										<input
											ref={tagRef}
											// biome-ignore lint/a11y/noAutofocus: intentional for popover
											autoFocus
											type="text"
											value={tagInput}
											onChange={(e) => setTagInput(e.target.value)}
											placeholder="Add tag..."
											className="w-full rounded-lg border border-border/30 bg-muted/25 px-3 py-2 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all duration-150"
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													handleAddTag(tagInput);
												}
											}}
										/>
									</form>
								</PopoverContent>
							</Popover>
						)}
					</div>
				</FieldRow>

				{/* Reporter (conditional) */}
				{reporter && (
					<FieldRow label="Reporter">
						<div className="flex items-center gap-2.5">
							<div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-muted/80 to-muted/40 text-muted-foreground text-[10px] font-bold ring-1 ring-border/25">
								{(reporter.full_name || reporter.username)
									.slice(0, 1)
									.toUpperCase()}
							</div>
							<span className="text-[13px] font-medium text-foreground">
								{reporter.full_name || reporter.username}
							</span>
						</div>
					</FieldRow>
				)}

				{/* Sprint (conditional) */}
				{(task.sprint_id || (canEdit && sprints.length > 0)) && (
					<FieldRow label="Sprint">
						{canEdit && sprints.length > 0 ? (
							<Popover>
								<PopoverTrigger
									type="button"
									className={
										task.sprint_id
											? "inline-flex items-center gap-1.5 rounded-lg border border-border/25 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-border/50 hover:bg-muted/40 transition-all duration-150 font-medium"
											: "inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/50 italic hover:text-muted-foreground/80 transition-colors"
									}
								>
									<GitBranch className="size-3 shrink-0 opacity-70" />
									{task.sprint_id
										? (sprints.find((s) => s.id === task.sprint_id)?.name ??
											task.sprint_id)
										: "No sprint"}
								</PopoverTrigger>
								<PopoverContent
									className="w-52 p-1 rounded-xl border border-border/40 shadow-lg"
									align="start"
								>
									<button
										type="button"
										className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 transition-colors duration-100"
										onClick={() => onUpdate?.({ sprint_id: null })}
									>
										<GitBranch className="size-3 shrink-0 opacity-60" />
										<span className="flex-1 text-left">No sprint</span>
										{!task.sprint_id && (
											<Check className="size-3.5 text-primary" />
										)}
									</button>
									{sprints.map((s) => (
										<button
											key={s.id}
											type="button"
											className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
											onClick={() => onUpdate?.({ sprint_id: s.id })}
										>
											<GitBranch className="size-3 shrink-0 text-muted-foreground/70" />
											<span className="flex-1 text-left truncate">
												{s.name}
											</span>
											{s.id === task.sprint_id && (
												<Check className="size-3.5 text-primary shrink-0" />
											)}
										</button>
									))}
								</PopoverContent>
							</Popover>
						) : (
							<div className="flex items-center gap-1.5">
								<GitBranch className="size-3 text-muted-foreground/70 shrink-0" />
								<span className="text-[13px] font-medium text-foreground truncate">
									{sprints.find((s) => s.id === task.sprint_id)?.name ??
										task.sprint_id}
								</span>
							</div>
						)}
					</FieldRow>
				)}

				{/* Parent task (conditional) */}
				{task.parent_task_id && (
					<FieldRow label="Parent task">
						<button
							type="button"
							className="flex items-center gap-1.5 text-[13px] text-primary/80 hover:text-primary font-medium hover:underline underline-offset-2 transition-colors duration-150"
						>
							<ArrowRight className="size-3 shrink-0" />
							<span className="truncate">{task.parent_task_id}</span>
						</button>
					</FieldRow>
				)}

				{/* Custom fields */}
				{localCustomFields.map((cf) => {
					const rawVal = task.custom_fields?.[cf.field_key];
					const hasVal = rawVal != null && rawVal !== "";
					return (
						<FieldRow key={cf.id} label={cf.display_name}>
							{hasVal ? (
								<FieldValue>{String(rawVal)}</FieldValue>
							) : (
								<FieldValue empty />
							)}
						</FieldRow>
					);
				})}
			</div>

			{/* Add fields */}
			{canEdit && (
				<button
					type="button"
					onClick={() => setAddFieldOpen(true)}
					className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 font-medium"
				>
					<Plus className="size-3.5" />
					Add fields
				</button>
			)}

			<AddFieldDialog
				open={addFieldOpen}
				onOpenChange={setAddFieldOpen}
				onAdd={(field) => setLocalCustomFields((prev) => [...prev, field])}
			/>
		</>
	);
}
