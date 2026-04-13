import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getTaskTypeIconComponent } from "@/components/projects/task-types/task-type-icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Task, ViewConfig } from "@/lib/integration-api";
import type {
	CustomFieldDefinition,
	ProjectMember,
	TaskStatus,
	TaskType,
} from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { TaskRow, getRowColConfig } from "./task-row";
import {
	type ColumnGroupDef,
	type TaskFieldUpdate,
	DEFAULT_VISIBLE_FIELDS,
	buildColumnDropUpdate,
	computeFieldSum,
	getColumnGroupDefs,
	getSwimlaneDefs,
	getTaskColumnKeys,
	getTaskSwimlaneKey,
} from "./view-utils";

// ── Add task row ──────────────────────────────────────────────────────────────

interface GroupAddRowProps {
	taskTypes: TaskType[];
	onAdd: (title: string, taskTypeId: string | null) => void;
}

function GroupAddRow({ taskTypes, onAdd }: GroupAddRowProps) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const defaultType =
		taskTypes.find((tt) => tt.is_default) ?? taskTypes[0] ?? null;
	const selectedType =
		taskTypes.find((tt) => tt.id === selectedTypeId) ?? defaultType;

	const open_ = () => {
		setOpen(true);
		setTimeout(() => inputRef.current?.focus(), 0);
	};

	const submit = () => {
		const title = value.trim();
		if (!title) return;
		onAdd(title, selectedType?.id ?? null);
		setValue("");
		setSelectedTypeId(null);
		setOpen(false);
	};

	const cancel = () => {
		setValue("");
		setSelectedTypeId(null);
		setOpen(false);
	};

	if (!open) {
		return (
			<button
				type="button"
				onClick={open_}
				className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/30 transition-all duration-150 w-full"
			>
				<Plus className="size-3" />
				Add task
			</button>
		);
	}

	const SelectedIcon = getTaskTypeIconComponent(selectedType?.icon ?? null);

	return (
		<div className="flex flex-col gap-1.5 px-4 py-2.5 border-b border-border/20">
			<div className="flex items-center gap-2">
				{taskTypes.length > 0 && selectedType && (
					<DropdownMenu>
						<DropdownMenuTrigger
							className={cn(
								"flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-all duration-150 hover:bg-muted/60 shrink-0",
							)}
							style={
								selectedType.color ? { color: selectedType.color } : undefined
							}
						>
							{SelectedIcon ? (
								<SelectedIcon className="size-3" />
							) : (
								<span className="size-3 rounded-full bg-current opacity-60" />
							)}
							<span>{selectedType?.name ?? "Task"}</span>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" sideOffset={2}>
							{taskTypes.map((tt) => {
								const Icon = getTaskTypeIconComponent(tt.icon ?? null);
								return (
									<DropdownMenuItem
										key={tt.id}
										onSelect={() => setSelectedTypeId(tt.id)}
										style={tt.color ? { color: tt.color } : undefined}
									>
										{Icon ? (
											<Icon className="size-3 mr-1.5" />
										) : (
											<span className="size-3 rounded-full bg-current opacity-60 mr-1.5" />
										)}
										{tt.name}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				<input
					ref={inputRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") submit();
						if (e.key === "Escape") cancel();
					}}
					placeholder="Task title…"
					className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-muted-foreground/50"
				/>
				<button
					type="button"
					onClick={cancel}
					className="flex items-center gap-1.5 rounded-lg bg-muted/40 text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-150"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={submit}
					disabled={!value.trim()}
					className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-40 transition-all duration-150"
				>
					Create
				</button>
			</div>
		</div>
	);
}

// ── Generic group component ───────────────────────────────────────────────────

interface GenericGroupProps {
	groupDef: ColumnGroupDef;
	tasks: Task[];
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	members: ProjectMember[];
	customFields: CustomFieldDefinition[];
	canCreate: boolean;
	defaultCollapsed?: boolean;
	fieldSum?: string;
	swimlaneDefs: ColumnGroupDef[];
	swimlaneBy: string | undefined;
	onCreateTask: (
		statusId: string,
		title: string,
		taskTypeId?: string | null,
	) => Promise<void>;
	onTaskClick: (task: Task) => void;
	manualSort?: boolean;
	onReorderTask?: (groupKey: string, taskId: string, newIndex: number) => void;
	onStatusChange?: (taskId: string, newStatusId: string) => void;
	canEdit?: boolean;
	isStatusGrouping: boolean;
	sortBy?: string;
	onUpdateTaskField?: (taskId: string, update: TaskFieldUpdate) => void;
	visibleFields: string[];
	taskIdPrefix?: string;
}

function GenericGroup({
	groupDef,
	tasks,
	statuses,
	taskTypes,
	members,
	customFields,
	canCreate,
	defaultCollapsed,
	fieldSum,
	swimlaneDefs,
	swimlaneBy,
	onCreateTask,
	onTaskClick,
	manualSort,
	onReorderTask,
	onStatusChange,
	canEdit,
	isStatusGrouping,
	onUpdateTaskField,
	visibleFields,
	taskIdPrefix = "",
}: GenericGroupProps) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [dragOverSwimKey, setDragOverSwimKey] = useState<string | null>(null);
	const [isDropTarget, setIsDropTarget] = useState(false);
	const [orderedTasks, setOrderedTasks] = useState<Task[]>(tasks);

	useEffect(() => {
		setOrderedTasks(tasks);
	}, [tasks]);

	const isDraggable = isStatusGrouping && !!(canEdit || manualSort);

	const sumValue = computeFieldSum(tasks, fieldSum, customFields);

	const getViewCtxTasks = () => orderedTasks;

	const handleIntraGroupDrop = (
		e: React.DragEvent,
		targetTask: Task,
		targetIndex: number,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const taskId = e.dataTransfer.getData("text/plain");
		const sourceGroupKey = e.dataTransfer.getData("application/x-source-group-key");

		if (isStatusGrouping && sourceGroupKey && sourceGroupKey !== groupDef.key) {
			if (canEdit) onStatusChange?.(taskId, groupDef.key as string);
			setDraggingId(null);
			setDragOverId(null);
			setIsDropTarget(false);
			return;
		}

		if (!manualSort) {
			setDraggingId(null);
			setDragOverId(null);
			setIsDropTarget(false);
			return;
		}

		const currentDraggingId = draggingId;
		if (!currentDraggingId || currentDraggingId === targetTask.id) return;
		const sourceIndex = orderedTasks.findIndex((t) => t.id === currentDraggingId);
		if (sourceIndex === -1) return;
		const updated = [...orderedTasks];
		const [moved] = updated.splice(sourceIndex, 1);
		updated.splice(targetIndex, 0, moved);
		setOrderedTasks(updated);
		onReorderTask?.(groupDef.key, currentDraggingId, targetIndex);
		setDraggingId(null);
		setDragOverId(null);
	};

	const handleGroupDragOver = (e: React.DragEvent) => {
		if (!isDraggable) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setIsDropTarget(true);
	};

	const handleGroupDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const taskId = e.dataTransfer.getData("text/plain");
		const sourceGroupKey = e.dataTransfer.getData("application/x-source-group-key");
		setIsDropTarget(false);
		setDraggingId(null);
		setDragOverId(null);
		if (!taskId || !canEdit || !isStatusGrouping) return;
		if (sourceGroupKey && sourceGroupKey !== groupDef.key) {
			onStatusChange?.(taskId, groupDef.key as string);
		}
	};

	const hasSwimlanes = swimlaneBy && swimlaneBy !== "none";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop group
		<div
			className={cn(
				"border-b border-border/25 last:border-0 transition-all duration-150",
				isDropTarget && "bg-primary/5 ring-inset ring-2 ring-primary/20",
			)}
			onDragOver={handleGroupDragOver}
			onDragLeave={() => setIsDropTarget(false)}
			onDrop={handleGroupDrop}
		>
			{/* Group header */}
			<button
				type="button"
				onClick={() => setCollapsed((v) => !v)}
				className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors duration-150"
			>
				{collapsed ? (
					<ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0" />
				) : (
					<ChevronDown className="size-3.5 text-muted-foreground/60 shrink-0" />
				)}
				{groupDef.color && (
					<span
						className="size-1.75 rounded-full shrink-0"
						style={{
							background: groupDef.color,
							boxShadow: `0 0 6px ${groupDef.color}40`,
						}}
					/>
				)}
				<span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/80 flex-1 text-left truncate">
					{groupDef.label}
				</span>
				{/* Field sum badge */}
				<span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
					{fieldSum && fieldSum !== "count"
						? `${sumValue}`
						: tasks.length}
				</span>
			</button>

			{!collapsed && (
				<>
					{hasSwimlanes ? (
						// Swimlane bands
						swimlaneDefs.map((swimDef) => {
							const laneTasks =
								swimDef.key === "__all"
									? getViewCtxTasks()
									: getViewCtxTasks().filter(
											(t) =>
												getTaskSwimlaneKey(t, swimlaneBy, {
													statuses,
													taskTypes,
													members,
													customFields,
												}) === swimDef.key,
										);

							const handleSwimBandDragOver = (e: React.DragEvent) => {
								if (!isDraggable || swimDef.key === "__all") return;
								e.preventDefault();
								e.dataTransfer.dropEffect = "move";
								setDragOverSwimKey(swimDef.key);
							};

							const handleSwimBandDrop = (e: React.DragEvent) => {
								e.preventDefault();
								const taskId = e.dataTransfer.getData("text/plain");
								const sourceSwimKey = e.dataTransfer.getData("application/x-source-swim-key");
								setDragOverSwimKey(null);
								setDraggingId(null);
								setDragOverId(null);
								if (!taskId || !canEdit || swimDef.key === "__all") return;
								if (sourceSwimKey && sourceSwimKey !== swimDef.key) {
									const swimUpdate = buildColumnDropUpdate(swimlaneBy, swimDef.fieldValue, customFields);
									if (Object.keys(swimUpdate).length > 0) {
										onUpdateTaskField?.(taskId, swimUpdate);
									}
								}
							};

							return (
								// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop swimlane band
								<div
									key={swimDef.key}
									className={cn(
										"border-t border-border/15",
										dragOverSwimKey === swimDef.key && isDraggable && "bg-primary/5 ring-inset ring-1 ring-primary/20",
									)}
									onDragOver={handleSwimBandDragOver}
									onDragLeave={(e) => {
										if (!e.currentTarget.contains(e.relatedTarget as Node)) {
											setDragOverSwimKey(null);
										}
									}}
									onDrop={handleSwimBandDrop}
								>
									{swimDef.key !== "__all" && (
										<div className="flex items-center gap-2 px-8 py-1.5 bg-muted/10">
											<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
												{swimDef.label}
											</span>
										</div>
									)}
									{/* Column headers (only shown once for first swimlane) */}
									{swimDef.key === (swimlaneDefs[0]?.key ?? "__all") && (
										<div className="flex items-center gap-3 px-4 py-1.5 bg-muted/20 border-b border-border/25">
											{isDraggable && <div className="w-3 shrink-0" />}
											<div className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">ID</div>
											<div className="flex-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">Title</div>
											{visibleFields.map((fk) => {
												const col = getRowColConfig(fk, customFields);
												return (
													<div
														key={fk}
														className={cn(
															col.className,
															"text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60",
															col.responsive ? "hidden sm:block" : "",
														)}
													>
														{col.headerLabel}
													</div>
												);
											})}
										</div>
									)}
									{laneTasks.length === 0 ? (
										<div className="flex flex-col items-center py-5 text-muted-foreground/40">
											<p className="text-[12px] font-medium">No tasks</p>
										</div>
									) : (
										laneTasks.map((task) => (
											// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop row slot
											<div
												key={task.id}
												className={cn(
													"relative",
													manualSort &&
														dragOverId === task.id &&
														draggingId !== task.id &&
														"border-t-2 border-primary/60",
												)}
												draggable={isDraggable}
												onDragStart={(e) => {
													e.dataTransfer.effectAllowed = "move";
													e.dataTransfer.setData("text/plain", task.id);
													e.dataTransfer.setData("application/x-paca-task-id", task.id);
													e.dataTransfer.setData(
														"application/x-source-group-key",
														groupDef.key,
													);
													e.dataTransfer.setData(
														"application/x-source-swim-key",
														swimDef.key,
													);
													setDraggingId(task.id);
												}}
												onDragEnd={() => {
													setDraggingId(null);
													setDragOverId(null);
													setIsDropTarget(false);
												}}
												onDragOver={(e) => {
													e.preventDefault();
													if (manualSort) setDragOverId(task.id);
												}}
												onDrop={(e) => {
													e.preventDefault();
													e.stopPropagation();
													const taskId = e.dataTransfer.getData("text/plain");
													const sourceGroupKey = e.dataTransfer.getData("application/x-source-group-key");
													const sourceSwimKey = e.dataTransfer.getData("application/x-source-swim-key");
													setDragOverSwimKey(null);
													// Cross-band drop: update swimlane field
													if (swimDef.key !== "__all" && sourceSwimKey && sourceSwimKey !== swimDef.key) {
														setDraggingId(null);
														setDragOverId(null);
														if (canEdit) {
															const swimUpdate = buildColumnDropUpdate(swimlaneBy, swimDef.fieldValue, customFields);
															if (Object.keys(swimUpdate).length > 0) {
																onUpdateTaskField?.(taskId, swimUpdate);
															}
														}
														return;
													}
													if (isStatusGrouping && sourceGroupKey && sourceGroupKey !== groupDef.key) {
														if (canEdit) onStatusChange?.(taskId, groupDef.key as string);
														setDraggingId(null);
														setDragOverId(null);
														setIsDropTarget(false);
														return;
													}
													if (!manualSort) {
														setDraggingId(null);
														setDragOverId(null);
														setIsDropTarget(false);
														return;
													}
													const currentDraggingId = draggingId;
													if (!currentDraggingId || currentDraggingId === task.id) return;
													const sourceLaneIndex = laneTasks.findIndex((t) => t.id === currentDraggingId);
													const sourceOrderedIndex = orderedTasks.findIndex((t) => t.id === currentDraggingId);
													const targetOrderedIndex = orderedTasks.findIndex((t) => t.id === task.id);
													if (sourceLaneIndex === -1 || sourceOrderedIndex === -1 || targetOrderedIndex === -1) return;
													const updated = [...orderedTasks];
													const [moved] = updated.splice(sourceOrderedIndex, 1);
													updated.splice(targetOrderedIndex, 0, moved);
													setOrderedTasks(updated);
													onReorderTask?.(groupDef.key, currentDraggingId, targetOrderedIndex);
													setDraggingId(null);
													setDragOverId(null);
												}}
											>
												<TaskRow
													task={task}
													taskIdPrefix={taskIdPrefix}
													statuses={statuses}
													taskTypes={taskTypes}
													members={members}
													customFields={customFields}
													visibleFields={visibleFields}
													onClick={() => onTaskClick(task)}
													showDragHandle={isDraggable}
													isDragging={draggingId === task.id}
													canEdit={canEdit}
													onUpdateTaskField={onUpdateTaskField}
												/>
											</div>
										))
									)}
								</div>
							);
						})
					) : (
						<>
							{/* Column headers */}
							<div className="flex items-center gap-3 px-4 py-1.5 bg-muted/20 border-y border-border/25">
								{isDraggable && <div className="w-3 shrink-0" />}
								<div className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">ID</div>
								<div className="flex-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">Title</div>
								{visibleFields.map((fk) => {
									const col = getRowColConfig(fk, customFields);
									return (
										<div
											key={fk}
											className={cn(
												col.className,
												"text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60",
												col.responsive ? "hidden sm:block" : "",
											)}
										>
											{col.headerLabel}
										</div>
									);
								})}
							</div>
							{orderedTasks.length === 0 ? (
								<div className="flex flex-col items-center py-8 text-muted-foreground/40">
									<p className="text-[12px] font-medium">No tasks</p>
								</div>
							) : (
								orderedTasks.map((task, index) => (
									// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop row slot
									<div
										key={task.id}
										className={cn(
											"relative",
											manualSort &&
												dragOverId === task.id &&
												draggingId !== task.id &&
												"border-t-2 border-primary/60",
										)}
										draggable={isDraggable}
										onDragStart={(e) => {
											e.dataTransfer.effectAllowed = "move";
											e.dataTransfer.setData("text/plain", task.id);
											e.dataTransfer.setData("application/x-paca-task-id", task.id);
											e.dataTransfer.setData(
												"application/x-source-group-key",
												groupDef.key,
											);
											setDraggingId(task.id);
										}}
										onDragEnd={() => {
											setDraggingId(null);
											setDragOverId(null);
											setIsDropTarget(false);
										}}
										onDragOver={(e) => {
											e.preventDefault();
											if (manualSort) setDragOverId(task.id);
										}}
										onDrop={(e) => handleIntraGroupDrop(e, task, index)}
									>
										<TaskRow
											task={task}										taskIdPrefix={taskIdPrefix}											statuses={statuses}
											taskTypes={taskTypes}
											members={members}
											customFields={customFields}
											visibleFields={visibleFields}
											onClick={() => onTaskClick(task)}
											showDragHandle={isDraggable}
											isDragging={draggingId === task.id}
											canEdit={canEdit}
											onUpdateTaskField={onUpdateTaskField}
										/>
									</div>
								))
							)}

							{canCreate && isStatusGrouping && groupDef.key !== "__none" && (
								<GroupAddRow
									taskTypes={taskTypes}
									onAdd={(title, typeId) =>
										onCreateTask(groupDef.key as string, title, typeId)
									}
								/>
							)}
						</>
					)}
				</>
			)}
		</div>
	);
}

// ── ListView ──────────────────────────────────────────────────────────────────

interface ListViewProps {
	tasks: Task[];
	taskIdPrefix?: string;
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	members?: ProjectMember[];
	customFields?: CustomFieldDefinition[];
	viewConfig?: ViewConfig;
	canCreate: boolean;
	searchQuery: string;
	assigneeFilter: string | null;
	onCreateTask: (
		statusId: string,
		title: string,
		taskTypeId?: string | null,
	) => Promise<void>;
	onTaskClick: (task: Task) => void;
	manualSort?: boolean;
	onReorderTask?: (groupKey: string, taskId: string, newIndex: number) => void;
	onStatusChange?: (taskId: string, newStatusId: string) => void;
	canEdit?: boolean;
	sortBy?: string;
	onUpdateTaskField?: (taskId: string, update: TaskFieldUpdate) => void;
}

export function ListView({
	tasks,
	taskIdPrefix = "",
	statuses,
	taskTypes,
	members = [],
	customFields = [],
	viewConfig,
	canCreate,
	searchQuery,
	assigneeFilter,
	onCreateTask,
	onTaskClick,
	manualSort,
	onReorderTask,
	onStatusChange,
	canEdit,
	sortBy,
	onUpdateTaskField,
}: ListViewProps) {
	const columnBy = viewConfig?.column_by ?? "status";
	const swimlaneBy = viewConfig?.swimlanes;
	const fieldSum = viewConfig?.field_sum;
	const visibleFields: string[] =
		viewConfig?.fields && viewConfig.fields.length > 0
			? viewConfig.fields
			: DEFAULT_VISIBLE_FIELDS;
	const isStatusGrouping = !viewConfig?.column_by || viewConfig.column_by === "status";

	const viewCtx = useMemo(
		() => ({ statuses, taskTypes, members, customFields }),
		[statuses, taskTypes, members, customFields],
	);

	const filtered = useMemo(
		() =>
			tasks.filter((t) => {
				if (searchQuery) {
					const q = searchQuery.toLowerCase();
					const taskId = taskIdPrefix
						? `${taskIdPrefix}-${t.task_number}`
						: `#${t.task_number}`;
					if (
						!t.title.toLowerCase().includes(q) &&
						!taskId.toLowerCase().includes(q)
					)
						return false;
				}
				if (assigneeFilter && t.assignee_id !== assigneeFilter) return false;
				return true;
			}),
		[tasks, searchQuery, assigneeFilter, taskIdPrefix],
	);

	// Compute static group defs
	const groupDefs = useMemo(
		() => getColumnGroupDefs(columnBy, viewCtx),
		[columnBy, viewCtx],
	);

	// For dynamic-value fields (number/text) build groups from actual task values
	const effectiveGroupDefs = useMemo(() => {
		if (groupDefs.length > 0) return groupDefs;
		const seen = new Set<string>();
		const dynamic: ColumnGroupDef[] = [];
		for (const t of filtered) {
			for (const k of getTaskColumnKeys(t, columnBy, viewCtx)) {
				if (!seen.has(k)) {
					seen.add(k);
					dynamic.push({
						key: k,
						label: k === "__none" ? "None" : k,
						fieldValue: k,
					});
				}
			}
		}
		if (!seen.has("__none")) {
			dynamic.push({ key: "__none", label: "None", fieldValue: null });
		}
		return dynamic;
	}, [groupDefs, filtered, columnBy, viewCtx]);

	const swimlaneDefs = useMemo(
		() => getSwimlaneDefs(swimlaneBy, viewCtx),
		[swimlaneBy, viewCtx],
	);

	const getGroupTasks = (groupKey: string): Task[] =>
		filtered.filter((t) =>
			getTaskColumnKeys(t, columnBy, viewCtx).includes(groupKey),
		);

	return (
		<div className="flex flex-col overflow-auto">
			{effectiveGroupDefs.map((grp) => {
				const groupTasks = getGroupTasks(grp.key);
				// Default-collapse "done" status groups
				const status = isStatusGrouping
					? statuses.find((s) => s.id === grp.key)
					: undefined;
				const isDone = status?.category === "done";

				return (
					<GenericGroup
						key={grp.key}
						groupDef={grp}
						tasks={groupTasks}
						statuses={statuses}
						taskTypes={taskTypes}
						members={members}
						customFields={customFields}
						canCreate={canCreate}
						defaultCollapsed={isDone}
						fieldSum={fieldSum}
						swimlaneDefs={swimlaneDefs}
						swimlaneBy={swimlaneBy}
						onCreateTask={onCreateTask}
						onTaskClick={onTaskClick}
						manualSort={manualSort}
						onReorderTask={onReorderTask}
						onStatusChange={onStatusChange}
						canEdit={canEdit}
						isStatusGrouping={isStatusGrouping}
						sortBy={sortBy}
						onUpdateTaskField={onUpdateTaskField}
						visibleFields={visibleFields}					taskIdPrefix={taskIdPrefix}					/>
				);
			})}
		</div>
	);
}
