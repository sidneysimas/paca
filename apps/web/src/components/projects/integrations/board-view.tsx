import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type Task, updateTask } from "@/lib/integration-api";
import type { TaskStatus, TaskType } from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { TaskCard } from "./task-card";

interface BoardViewProps {
	projectId: string;
	tasks: Task[];
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	canCreate: boolean;
	canEdit: boolean;
	searchQuery: string;
	assigneeFilter: string | null;
	tasksQueryKey: unknown[];
	onCreateTask: (statusId: string, title: string) => Promise<void>;
	onTaskClick: (task: Task) => void;
	manualSort?: boolean;
	onReorderTask?: (statusId: string, taskId: string, newIndex: number) => void;
}

interface ColumnAddProps {
	onAdd: (title: string) => void;
}

function ColumnAddTask({ onAdd }: ColumnAddProps) {
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
				className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
			>
				<Plus className="size-3.5" />
				Add task
			</button>
		);
	}

	return (
		<div className="rounded-lg border border-primary/40 bg-card p-2 shadow-xs">
			<input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") submit();
					if (e.key === "Escape") cancel();
				}}
				placeholder="Task title…"
				className="w-full rounded px-2 py-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
			/>
			<div className="mt-1.5 flex items-center gap-1.5 justify-end">
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
		</div>
	);
}

export function BoardView({
	projectId,
	tasks,
	statuses,
	taskTypes,
	canCreate,
	canEdit,
	searchQuery,
	assigneeFilter,
	tasksQueryKey,
	onCreateTask,
	onTaskClick,
	manualSort,
	onReorderTask,
}: BoardViewProps) {
	const qc = useQueryClient();
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [overStatusId, setOverStatusId] = useState<string | null>(null);
	const [overCardId, setOverCardId] = useState<string | null>(null);
	// Per-column manual order (id arrays); reset when parent tasks refresh
	const [columnOrderMap, setColumnOrderMap] = useState<
		Record<string, string[]>
	>({});
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset local order whenever the task list is refreshed from the server
	useEffect(() => {
		setColumnOrderMap({});
	}, [tasks]);

	const updateMutation = useMutation({
		mutationFn: ({
			taskId,
			statusId,
			sprintId,
		}: {
			taskId: string;
			statusId: string;
			sprintId: string | null | undefined;
		}) =>
			updateTask(projectId, taskId, {
				status_id: statusId,
				sprint_id: sprintId ?? null,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: tasksQueryKey }),
	});

	const filteredTasks = tasks.filter((t) => {
		if (
			searchQuery &&
			!t.title.toLowerCase().includes(searchQuery.toLowerCase())
		)
			return false;
		if (assigneeFilter && t.assignee_id !== assigneeFilter) return false;
		return true;
	});

	const tasksByStatus = (statusId: string) => {
		const col = filteredTasks.filter((t) => t.status_id === statusId);
		if (manualSort) return col; // preserve parent sort order (already sorted by view_position)
		return col.sort((a, b) => a.created_at.localeCompare(b.created_at));
	};
	const getColumnTasks = (statusId: string): Task[] => {
		const ids = columnOrderMap[statusId];
		if (ids) {
			return ids
				.map((id) => filteredTasks.find((t) => t.id === id))
				.filter((t): t is Task => t !== undefined);
		}
		return tasksByStatus(statusId);
	};

	const unassignedTasks = filteredTasks.filter((t) => !t.status_id);

	const handleDragStart = (e: React.DragEvent, taskId: string) => {
		if (!canEdit) return;
		setDraggingId(taskId);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", taskId);
	};

	const handleDragEnd = () => {
		setDraggingId(null);
		setOverStatusId(null);
		setOverCardId(null);
	};

	const handleDrop = (e: React.DragEvent, statusId: string) => {
		e.preventDefault();
		const taskId = e.dataTransfer.getData("text/plain");
		if (!taskId || !canEdit) return;
		const task = tasks.find((t) => t.id === taskId);
		if (task && task.status_id !== statusId) {
			updateMutation.mutate({ taskId, statusId, sprintId: task.sprint_id });
		}
		setDraggingId(null);
		setOverStatusId(null);
		setOverCardId(null);
	};

	const handleDropOnCard = (
		e: React.DragEvent,
		targetStatusId: string,
		targetTaskId: string,
		targetIndex: number,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const taskId = e.dataTransfer.getData("text/plain");
		if (!taskId || !canEdit) {
			setDraggingId(null);
			setOverCardId(null);
			return;
		}
		const task = tasks.find((t) => t.id === taskId);
		if (!task) {
			setDraggingId(null);
			setOverCardId(null);
			return;
		}
		if (task.status_id !== targetStatusId) {
			updateMutation.mutate({
				taskId,
				statusId: targetStatusId,
				sprintId: task.sprint_id,
			});
		} else if (manualSort && taskId !== targetTaskId) {
			// Optimistic local reorder within column
			const current = getColumnTasks(targetStatusId);
			const srcIdx = current.findIndex((t) => t.id === taskId);
			if (srcIdx !== -1) {
				const next = [...current];
				const [moved] = next.splice(srcIdx, 1);
				next.splice(targetIndex, 0, moved);
				setColumnOrderMap((prev) => ({
					...prev,
					[targetStatusId]: next.map((t) => t.id),
				}));
			}
			onReorderTask?.(targetStatusId, taskId, targetIndex);
		}
		setDraggingId(null);
		setOverStatusId(null);
		setOverCardId(null);
	};

	const handleDragOver = (e: React.DragEvent, statusId: string) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setOverStatusId(statusId);
	};

	const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);

	return (
		<div className="flex gap-3 overflow-x-auto px-6 py-4 pb-6">
			{sortedStatuses.map((status) => {
				const columnTasks = getColumnTasks(status.id);
				const isOver = overStatusId === status.id;

				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop column requires pointer events; keyboard reorder is handled separately
					<div
						key={status.id}
						data-status-id={status.id}
						className="flex w-72 shrink-0 flex-col gap-2"
						onDragOver={(e) => handleDragOver(e, status.id)}
						onDrop={(e) => handleDrop(e, status.id)}
					>
						{/* Column header */}
						<div className="flex items-center gap-2 px-1">
							<span
								className="size-2 rounded-full shrink-0"
								style={{
									background: status.color ?? "oklch(var(--muted-foreground))",
								}}
							/>
							<span className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">
								{status.name}
							</span>
							<span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
								{columnTasks.length}
							</span>
						</div>

						{/* Drop zone */}
						<div
							className={cn(
								"flex flex-col gap-2 rounded-xl p-2 min-h-30 transition-colors duration-150",
								isOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/20",
							)}
						>
							{columnTasks.length === 0 && !isOver && (
								<div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
									<p className="text-xs text-muted-foreground/50">No tasks</p>
								</div>
							)}

							{columnTasks.map((task, index) => (
								// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop card slot; pointer events only
								<div
									key={task.id}
									className={cn(
										"relative",
										manualSort &&
											overCardId === task.id &&
											draggingId !== task.id &&
											"border-t-2 border-primary/60",
									)}
									onDragOver={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setOverStatusId(status.id);
										if (manualSort) setOverCardId(task.id);
									}}
									onDrop={(e) => handleDropOnCard(e, status.id, task.id, index)}
								>
									<TaskCard
										task={task}
										statuses={statuses}
										taskTypes={taskTypes}
										canEdit={canEdit}
										isDragging={draggingId === task.id}
										onDragStart={(e) => handleDragStart(e, task.id)}
										onDragEnd={handleDragEnd}
										onClick={() => onTaskClick(task)}
									/>
								</div>
							))}
							{canCreate && (
								<ColumnAddTask
									onAdd={(title) => onCreateTask(status.id, title)}
								/>
							)}
						</div>
					</div>
				);
			})}
			{/* Catch-all column for unstatused tasks */}
			{unassignedTasks.length > 0 && (
				<div className="flex w-72 shrink-0 flex-col gap-2">
					<div className="flex items-center gap-2 px-1">
						<span className="size-2 rounded-full bg-muted-foreground/30 shrink-0" />
						<span className="text-xs font-semibold text-foreground/50 tracking-wide uppercase">
							No Status
						</span>
						<span className="ml-auto text-xs text-muted-foreground tabular-nums">
							{unassignedTasks.length}
						</span>
					</div>
					<div className="flex flex-col gap-2 rounded-xl bg-muted/10 p-2">
						{unassignedTasks.map((task) => (
							<TaskCard
								key={task.id}
								task={task}
								statuses={statuses}
								taskTypes={taskTypes}
								canEdit={false}
								isDragging={draggingId === task.id}
								onDragStart={(e) => handleDragStart(e, task.id)}
								onDragEnd={handleDragEnd}
								onClick={() => onTaskClick(task)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
