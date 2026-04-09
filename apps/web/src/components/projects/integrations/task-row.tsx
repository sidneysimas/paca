import { GripVertical, User } from "lucide-react";

import type { Task } from "@/lib/integration-api";
import type { TaskStatus, TaskType } from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { getPriority } from "./priority";

interface TaskRowProps {
	task: Task;
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	onClick?: () => void;
	showDragHandle?: boolean;
	isDragging?: boolean;
}

export function TaskRow({
	task,
	statuses,
	taskTypes,
	onClick,
	showDragHandle,
	isDragging,
}: TaskRowProps) {
	const taskType = taskTypes.find((t) => t.id === task.task_type_id);
	const status = statuses.find((s) => s.id === task.status_id);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: draggable list row with click; converting to button breaks drag-and-drop
		// biome-ignore lint/a11y/useKeyWithClickEvents: drag-and-drop row; keyboard nav handled by parent
		<div
			onClick={onClick}
			className={cn(
				"group flex items-center gap-3 px-4 py-2.5 cursor-pointer",
				"hover:bg-muted/40 transition-colors duration-100 border-b border-border/30 last:border-0",
				isDragging && "opacity-40 bg-muted/20",
			)}
		>
			{/* Drag handle */}
			{showDragHandle && (
				<GripVertical className="size-3.5 shrink-0 -ml-1.5 text-muted-foreground/30 group-hover:text-muted-foreground/70 cursor-grab" />
			)}
			{/* Task type badge */}
			<div className="w-16 shrink-0">
				{taskType ? (
					<span
						className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight truncate max-w-full"
						style={{
							backgroundColor: taskType.color
								? `${taskType.color}22`
								: "oklch(var(--muted))",
							color: taskType.color ?? "inherit",
						}}
					>
						{taskType.name}
					</span>
				) : (
					<span className="text-xs text-muted-foreground/40">—</span>
				)}
			</div>

			{/* Priority */}
			<div className="hidden sm:flex w-20 shrink-0 items-center gap-1">
				{(() => {
					const p = getPriority(task.importance);
					return task.importance > 0 ? (
						<>
							<span
								className="size-2 rounded-full shrink-0"
								style={{ background: p.color }}
							/>
							<span className="text-xs truncate" style={{ color: p.color }}>
								{p.label}
							</span>
						</>
					) : (
						<span className="text-xs text-muted-foreground/40">—</span>
					);
				})()}
			</div>

			{/* Title */}
			<span className="flex-1 text-sm text-foreground truncate">
				{task.title}
			</span>

			{/* Status */}
			<div className="hidden sm:flex w-24 shrink-0 items-center gap-1.5">
				{status ? (
					<>
						<span
							className="size-2 rounded-full shrink-0"
							style={{
								background: status.color ?? "oklch(var(--muted-foreground))",
							}}
						/>
						<span className="text-xs text-muted-foreground truncate">
							{status.name}
						</span>
					</>
				) : (
					<span className="text-xs text-muted-foreground/40">—</span>
				)}
			</div>

			{/* Assignee */}
			<div className="shrink-0">
				{task.assignee_id ? (
					<div className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-bold ring-1 ring-border/50">
						<User className="size-3.5" />
					</div>
				) : (
					<div className="flex size-6 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground/30">
						<User className="size-3.5" />
					</div>
				)}
			</div>
		</div>
	);
}
