import { CalendarDays } from "lucide-react";

import type { Task } from "@/lib/integration-api";
import type { TaskStatus, TaskType } from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { TaskRow } from "./task-row";

interface RoadmapViewProps {
	tasks: Task[];
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	searchQuery: string;
	assigneeFilter: string | null;
	onTaskClick: (task: Task) => void;
}

// Approximate bar width as % of the month based on creation date within a range
function getBarStyle(task: Task, minMs: number, rangeMs: number) {
	const created = new Date(task.created_at).getTime();
	const updated = new Date(task.updated_at).getTime();
	const left = Math.max(0, Math.min(100, ((created - minMs) / rangeMs) * 100));
	// Bar width spans created → updated (min 3%)
	const right = Math.max(0, Math.min(100, ((updated - minMs) / rangeMs) * 100));
	const width = Math.max(3, right - left);
	return { left: `${left}%`, width: `${width}%` };
}

export function RoadmapView({
	tasks,
	statuses,
	taskTypes,
	searchQuery,
	assigneeFilter,
	onTaskClick,
}: RoadmapViewProps) {
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

	// Compute time range across all tasks for bar positioning
	const timestamps = filtered.flatMap((t) => [
		new Date(t.created_at).getTime(),
		new Date(t.updated_at).getTime(),
	]);
	const minMs = timestamps.length
		? Math.min(...timestamps)
		: Date.now() - 30 * 86400_000;
	const maxMs = timestamps.length ? Math.max(...timestamps) : Date.now();
	const rangeMs = Math.max(maxMs - minMs, 7 * 86400_000); // at least 7 days

	// Month labels for the timeline header
	const startDate = new Date(minMs);
	const endDate = new Date(maxMs + 86400_000 * 3);
	const months: { label: string; left: string }[] = [];
	const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
	while (cur <= endDate) {
		const pos = Math.max(0, ((cur.getTime() - minMs) / rangeMs) * 100);
		months.push({
			label: cur.toLocaleString("default", { month: "short", year: "2-digit" }),
			left: `${pos}%`,
		});
		cur.setMonth(cur.getMonth() + 1);
	}

	const hasVisibleTasks = filtered.length > 0;

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Timeline header */}
			<div className="shrink-0 border-b border-border/40 bg-muted/10">
				<div className="flex items-center gap-3 px-4 py-2 border-b border-border/30">
					<CalendarDays className="size-3.5 text-muted-foreground" />
					<span className="text-xs font-medium text-muted-foreground">
						Timeline (based on activity)
					</span>
				</div>
				<div className="relative h-7 overflow-hidden px-4">
					{months.map((m) => (
						<span
							key={m.label}
							className="absolute top-1.5 text-[10px] font-medium text-muted-foreground/60 whitespace-nowrap"
							style={{ left: m.left }}
						>
							{m.label}
						</span>
					))}
				</div>
			</div>

			{/* Task rows with bars */}
			<div className="flex-1 overflow-auto">
				{!hasVisibleTasks ? (
					<div className="flex h-full items-center justify-center">
						<p className="text-sm text-muted-foreground/50">
							No tasks to display
						</p>
					</div>
				) : (
					sortedStatuses.map((status) => {
						const groupTasks = filtered.filter(
							(t) => t.status_id === status.id,
						);
						if (groupTasks.length === 0) return null;

						return (
							<div
								key={status.id}
								className="border-b border-border/40 last:border-0"
							>
								{/* Group header */}
								<div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/30">
									<span
										className="size-2 rounded-full shrink-0"
										style={{
											background:
												status.color ?? "oklch(var(--muted-foreground))",
										}}
									/>
									<span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
										{status.name}
									</span>
									<span className="text-xs text-muted-foreground tabular-nums">
										{groupTasks.length}
									</span>
								</div>

								{/* Rows: task info + timeline bar */}
								{groupTasks.map((task) => {
									const barStyle = getBarStyle(task, minMs, rangeMs);
									const type = task.task_type_id
										? taskTypes.find((t) => t.id === task.task_type_id)
										: null;
									return (
										<button
											type="button"
											key={task.id}
											className="grid w-full border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer text-left"
											style={{ gridTemplateColumns: "minmax(220px, 35%) 1fr" }}
											onClick={() => onTaskClick(task)}
										>
											{/* Left: task summary */}
											<div className="flex items-center gap-2 px-4 py-2.5 border-r border-border/30 min-w-0">
												{type && (
													<span
														className="shrink-0 size-1.5 rounded-full"
														style={{
															background:
																type.color ?? "oklch(var(--muted-foreground))",
														}}
													/>
												)}
												<span className="truncate text-xs">{task.title}</span>
											</div>

											{/* Right: timeline bar */}
											<div className="relative px-4 flex items-center">
												<div className="absolute inset-x-4 h-px bg-border/20" />
												<div
													className={cn(
														"absolute h-5 rounded-full opacity-80",
														"bg-primary/60",
													)}
													style={barStyle}
												/>
											</div>
										</button>
									);
								})}
							</div>
						);
					})
				)}

				{/* Unstatused tasks */}
				{filtered.filter((t) => !t.status_id).length > 0 && (
					<div className="border-b border-border/40 last:border-0">
						<div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/30">
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
		</div>
	);
}
