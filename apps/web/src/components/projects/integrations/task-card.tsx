import { GripVertical, User } from "lucide-react";

import type { Task } from "@/lib/integration-api";
import type { TaskStatus, TaskType } from "@/lib/project-api";
import { cn } from "@/lib/utils";

interface TaskCardProps {
	task: Task;
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	onClick?: () => void;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: (e: React.DragEvent) => void;
	isDragging?: boolean;
	canEdit?: boolean;
}

export function TaskCard({
	task,
	taskTypes,
	onClick,
	onDragStart,
	onDragEnd,
	isDragging,
	canEdit,
}: TaskCardProps) {
	const taskType = taskTypes.find((t) => t.id === task.task_type_id);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: draggable card with click; converted to button would break drag-and-drop
		// biome-ignore lint/a11y/useKeyWithClickEvents: drag-and-drop card; keyboard nav handled by parent
		<div
			data-task-id={task.id}
			draggable={canEdit}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onClick={onClick}
			className={cn(
				"group relative rounded-lg border border-border/60 bg-card p-3 shadow-xs cursor-pointer transition-all duration-150 select-none",
				"hover:border-border hover:shadow-sm hover:bg-card",
				isDragging && "opacity-50 ring-2 ring-primary/30 shadow-lg rotate-1",
				canEdit && "cursor-grab active:cursor-grabbing",
			)}
		>
			{canEdit && (
				<div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 transition-opacity">
					<GripVertical className="size-3.5 text-muted-foreground" />
				</div>
			)}

			<div className="flex items-start gap-2 min-w-0">
				{/* Task type badge */}
				{taskType && (
					<span
						className="mt-px shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
						style={{
							backgroundColor: taskType.color
								? `${taskType.color}22`
								: "oklch(var(--muted))",
							color: taskType.color ?? "inherit",
						}}
					>
						{taskType.name}
					</span>
				)}

				{/* Title */}
				<span className="text-sm leading-snug text-foreground line-clamp-2 flex-1 min-w-0">
					{task.title}
				</span>
			</div>

			{/* Footer: assignee */}
			<div className="mt-2.5 flex items-center justify-end">
				{task.assignee_id ? (
					<div className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-bold ring-1 ring-border/50">
						<User className="size-3" />
					</div>
				) : (
					<div className="flex size-5 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground/40">
						<User className="size-3" />
					</div>
				)}
			</div>
		</div>
	);
}
