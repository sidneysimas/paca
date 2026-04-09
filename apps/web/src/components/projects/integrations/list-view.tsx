import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Task } from "@/lib/integration-api";
import type { TaskStatus, TaskType } from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { TaskRow } from "./task-row";

interface ListViewProps {
	tasks: Task[];
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	canCreate: boolean;
	searchQuery: string;
	assigneeFilter: string | null;
	onCreateTask: (statusId: string, title: string) => Promise<void>;
	onTaskClick: (task: Task) => void;
	manualSort?: boolean;
	onReorderTask?: (statusId: string, taskId: string, newIndex: number) => void;
	onStatusChange?: (taskId: string, newStatusId: string) => void;
	canEdit?: boolean;
}

interface GroupAddRowProps {
	onAdd: (title: string) => void;
}

function GroupAddRow({ onAdd }: GroupAddRowProps) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const open_ = () => {
		setOpen(true);
		setTimeout(() => inputRef.current?.focus(), 0);
	};

	const submit = () => {
		const title = value.trim();
		if (!title) return;
		onAdd(title);
		setValue("");
		setOpen(false);
	};

	const cancel = () => {
		setValue("");
		setOpen(false);
	};

	if (!open) {
		return (
			<button
				type="button"
				onClick={open_}
				className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors w-full"
			>
				<Plus className="size-3.5" />
				Add task
			</button>
		);
	}

	return (
		<div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
			<input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") submit();
					if (e.key === "Escape") cancel();
				}}
				placeholder="Task title…"
				className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
			/>
			<button
				type="button"
				onClick={cancel}
				className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				onClick={submit}
				disabled={!value.trim()}
				className="px-2.5 py-0.5 rounded text-xs font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
			>
				Create
			</button>
		</div>
	);
}

interface StatusGroupProps {
	status: TaskStatus;
	tasks: Task[];
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	canCreate: boolean;
	defaultCollapsed?: boolean;
	onCreateTask: (statusId: string, title: string) => Promise<void>;
	onTaskClick: (task: Task) => void;
	manualSort?: boolean;
	onReorderTask?: (statusId: string, taskId: string, newIndex: number) => void;
	onStatusChange?: (taskId: string, newStatusId: string) => void;
	canEdit?: boolean;
}

function StatusGroup({
	status,
	tasks,
	statuses,
	taskTypes,
	canCreate,
	defaultCollapsed,
	onCreateTask,
	onTaskClick,
	manualSort,
	onReorderTask,
	onStatusChange,
	canEdit,
}: StatusGroupProps) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [isDropTarget, setIsDropTarget] = useState(false);
	const [orderedTasks, setOrderedTasks] = useState<Task[]>(tasks);

	// Sync when parent tasks array changes (after API refresh)
	useEffect(() => {
		setOrderedTasks(tasks);
	}, [tasks]);

	const isDraggable = canEdit || manualSort;

	const handleIntraGroupDrop = (
		e: React.DragEvent,
		targetTask: Task,
		targetIndex: number,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const taskId = e.dataTransfer.getData("text/plain");
		const sourceStatusId = e.dataTransfer.getData(
			"application/x-source-status-id",
		);
		// Cross-group drop landing on a task row — delegate to group-level handler
		if (sourceStatusId && sourceStatusId !== status.id) {
			if (canEdit) onStatusChange?.(taskId, status.id);
			setDraggingId(null);
			setDragOverId(null);
			setIsDropTarget(false);
			return;
		}
		// Same-group reorder
		const currentDraggingId = draggingId;
		if (!currentDraggingId || currentDraggingId === targetTask.id) return;
		const sourceIndex = orderedTasks.findIndex(
			(t) => t.id === currentDraggingId,
		);
		if (sourceIndex === -1) return;
		const updated = [...orderedTasks];
		const [moved] = updated.splice(sourceIndex, 1);
		updated.splice(targetIndex, 0, moved);
		setOrderedTasks(updated);
		onReorderTask?.(status.id, currentDraggingId, targetIndex);
		setDraggingId(null);
		setDragOverId(null);
	};

	const handleGroupDragOver = (e: React.DragEvent) => {
		if (!canEdit && !manualSort) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setIsDropTarget(true);
	};

	const handleGroupDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const taskId = e.dataTransfer.getData("text/plain");
		const sourceStatusId = e.dataTransfer.getData(
			"application/x-source-status-id",
		);
		setIsDropTarget(false);
		setDraggingId(null);
		setDragOverId(null);
		if (!taskId || !canEdit) return;
		if (sourceStatusId && sourceStatusId !== status.id) {
			onStatusChange?.(taskId, status.id);
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop group container; pointer events only
		<div
			className={cn(
				"border-b border-border/40 last:border-0 transition-colors duration-150",
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
				className="flex w-full items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30 transition-colors"
			>
				{collapsed ? (
					<ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
				) : (
					<ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
				)}
				<span
					className="size-2 rounded-full shrink-0"
					style={{
						background: status.color ?? "oklch(var(--muted-foreground))",
					}}
				/>
				<span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
					{status.name}
				</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{tasks.length}
				</span>
			</button>

			{/* Group rows */}
			{!collapsed && (
				<>
					{/* Column headers */}
					<div className="flex items-center gap-3 px-4 py-1.5 bg-muted/20 border-y border-border/30">
						{isDraggable && <div className="w-3 shrink-0" />}
						<div className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
							Type
						</div>
						<div className="hidden sm:block w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
							Priority
						</div>
						<div className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
							Title
						</div>
						<div className="hidden sm:block w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
							Status
						</div>
						<div className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
							Assignee
						</div>
					</div>

					{tasks.length === 0 ? (
						<div className="px-4 py-4 text-xs text-muted-foreground/50 text-center">
							No tasks in this status
						</div>
					) : (
						orderedTasks.map((task, index) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop row slot; pointer events only
							<div
								key={task.id}
								className={cn(
									"relative",
									dragOverId === task.id &&
										draggingId !== task.id &&
										"border-t-2 border-primary/60",
								)}
								draggable={isDraggable}
								onDragStart={(e) => {
									e.dataTransfer.effectAllowed = "move";
									e.dataTransfer.setData("text/plain", task.id);
									e.dataTransfer.setData(
										"application/x-source-status-id",
										status.id,
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
									task={task}
									statuses={statuses}
									taskTypes={taskTypes}
									onClick={() => onTaskClick(task)}
									showDragHandle={isDraggable}
									isDragging={draggingId === task.id}
								/>
							</div>
						))
					)}

					{canCreate && (
						<GroupAddRow onAdd={(title) => onCreateTask(status.id, title)} />
					)}
				</>
			)}
		</div>
	);
}

export function ListView({
	tasks,
	statuses,
	taskTypes,
	canCreate,
	searchQuery,
	assigneeFilter,
	onCreateTask,
	onTaskClick,
	manualSort,
	onReorderTask,
	onStatusChange,
	canEdit,
}: ListViewProps) {
	const filtered = tasks.filter((t) => {
		if (
			searchQuery &&
			!t.title.toLowerCase().includes(searchQuery.toLowerCase())
		)
			return false;
		if (assigneeFilter && t.assignee_id !== assigneeFilter) return false;
		return true;
	});

	const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);

	return (
		<div className="flex flex-col divide-y divide-border/30 overflow-auto">
			{sortedStatuses.map((status) => {
				const groupTasks = filtered.filter((t) => t.status_id === status.id);
				const isDone = status.category === "done";
				return (
					<StatusGroup
						key={status.id}
						status={status}
						tasks={groupTasks}
						statuses={statuses}
						taskTypes={taskTypes}
						canCreate={canCreate}
						defaultCollapsed={isDone}
						onCreateTask={onCreateTask}
						onTaskClick={onTaskClick}
						manualSort={manualSort}
						onReorderTask={onReorderTask}
						onStatusChange={onStatusChange}
						canEdit={canEdit}
					/>
				);
			})}

			{/* Unassigned tasks group */}
			{filtered.filter((t) => !t.status_id).length > 0 && (
				<div className="border-b border-border/40 last:border-0">
					<div className="flex items-center gap-2.5 px-4 py-2.5">
						<ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
						<span className="size-2 rounded-full bg-muted-foreground/30 shrink-0" />
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/50">
							No Status
						</span>
						<span className="text-xs text-muted-foreground tabular-nums">
							{filtered.filter((t) => !t.status_id).length}
						</span>
					</div>
					{filtered
						.filter((t) => !t.status_id)
						.map((task) => (
							<TaskRow
								key={task.id}
								task={task}
								statuses={statuses}
								taskTypes={taskTypes}
								onClick={() => onTaskClick(task)}
							/>
						))}
				</div>
			)}
		</div>
	);
}
