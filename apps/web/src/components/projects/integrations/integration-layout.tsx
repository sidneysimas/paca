import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

// Upper bound for manual-sort positions.  All computed positions stay strictly
// inside (0, POSITION_MAX) by always taking midpoints toward the boundaries, so
// positions can never go negative and never overflow float64.
const POSITION_MAX = Number.MAX_SAFE_INTEGER; // 2^53 − 1 ≈ 9 × 10^15
import {
	ChevronDown,
	KanbanSquare,
	List,
	Map as MapIcon,
	Plus,
	Search,
	SlidersHorizontal,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	allTasksQueryOptions,
	backlogTasksQueryOptions,
	backlogViewsQueryOptions,
	createBacklogView,
	createSprint,
	createTask,
	createView,
	deleteBacklogView,
	deleteView,
	type IntegrationView,
	layoutToViewType,
	bulkMoveBacklogTaskPositions,
	bulkMoveTaskPositions,
	reorderBacklogViews,
	reorderViews,
	sprintTasksQueryOptions,
	sprintsQueryOptions,
	type Task,
	updateBacklogView,
	updateSprint,
	updateTask,
	updateView,
	type ViewConfig,
	type ViewLayout,
	viewsQueryOptions,
} from "@/lib/integration-api";
import {
	customFieldsQueryOptions,
	projectMembersQueryOptions,
	projectQueryOptions,
	taskStatusesQueryOptions,
	taskTypesQueryOptions,
} from "@/lib/project-api";

import {
	getColumnGroupDefs,
	getTaskColumnKeys,
	sortTasksByConfig,
	type TaskFieldUpdate,
	type ViewContext,
} from "./view-utils";
import { cn } from "@/lib/utils";

import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { NewViewPopover } from "./new-view-popover";
import { RenameViewDialog } from "./rename-view-dialog";
import { RoadmapView } from "./roadmap-view";
import { TaskDetailModal } from "./task-detail-modal";
import { ViewSettingsPanel } from "./view-settings-panel";

interface IntegrationLayoutProps {
	projectId: string;
	integrationKey: string;
	title: string;
	description?: string | null;
	canCreate: boolean;
	canEdit: boolean;
	canManageViews: boolean;
	onTaskClick?: (task: Task) => void;
	sprintId?: string | null;
	/** Whether this layout is the product backlog (allows sprint management) */
	isBacklog?: boolean;
	/** Optional action buttons to show in the page header */
	headerActions?: ReactNode;
}

export function IntegrationLayout({
	projectId,
	integrationKey,
	title,
	description,
	canCreate,
	canEdit,
	canManageViews,
	onTaskClick,
	sprintId,
	isBacklog = false,
	headerActions,
}: IntegrationLayoutProps) {
	const qc = useQueryClient();
	const navigate = useNavigate();

	const { data: project } = useQuery(projectQueryOptions(projectId));
	const taskIdPrefix = project?.task_id_prefix ?? "";

	const { data: statuses = [] } = useQuery(taskStatusesQueryOptions(projectId));
	const { data: taskTypes = [] } = useQuery(taskTypesQueryOptions(projectId));
	const creatableTaskTypes = useMemo(
		() => taskTypes.filter((tt) => !tt.is_system),
		[taskTypes],
	);
	const { data: customFields = [] } = useQuery(
		customFieldsQueryOptions(projectId),
	);

	const viewsQuery = useQuery(
		sprintId
			? viewsQueryOptions(projectId, sprintId)
			: backlogViewsQueryOptions(projectId),
	);

	const serverViews = viewsQuery.data ?? [];
	const views = serverViews.length > 0 ? serverViews : [];

	const viewsQueryKey = sprintId
		? viewsQueryOptions(projectId, sprintId).queryKey
		: backlogViewsQueryOptions(projectId).queryKey;

	const seedingRef = useRef(false);
	useEffect(() => {
		if (!viewsQuery.isSuccess || serverViews.length > 0 || seedingRef.current)
			return;
		seedingRef.current = true;
		const seed = sprintId
			? Promise.all([
					createView(projectId, sprintId, {
						name: "Board",
						view_type: "board",
					}),
					createView(projectId, sprintId, {
						name: "Table",
						view_type: "table",
					}),
				])
			: createBacklogView(projectId, {
					name: "Table",
					view_type: "table",
					config: { column_by: "sprint" },
				});
		seed
			.then(() => qc.invalidateQueries({ queryKey: viewsQueryKey }))
			.catch(console.error);
	}, [
		viewsQuery.isSuccess,
		serverViews.length,
		sprintId,
		projectId,
		qc,
		viewsQueryKey,
	]);

	const [previewConfig, setPreviewConfig] = useState<ViewConfig | undefined>(
		undefined,
	);
	const [preferredViewId, setPreferredViewId] = useState<string>(() => {
		try {
			return localStorage.getItem(`paca:active-view:${integrationKey}`) ?? "";
		} catch {
			return "";
		}
	});

	const activeView = views.find((v) => v.id === preferredViewId) ?? views[0];
	const activeViewId = activeView?.id ?? "";

	useEffect(() => {
		if (!activeViewId) return;
		try {
			localStorage.setItem(`paca:active-view:${integrationKey}`, activeViewId);
		} catch {
			/* ignore */
		}
	}, [activeViewId, integrationKey]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear preview when switching views to prevent settings from bleeding across views
	useEffect(() => {
		setPreviewConfig(undefined);
	}, [activeViewId]);

	const [renameTarget, setRenameTarget] = useState<IntegrationView | null>(
		null,
	);
	const [renameOpen, setRenameOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const activeViewConfig = previewConfig ?? activeView?.config;
	const isManualSort =
		!activeViewConfig?.sort_by ||
		activeViewConfig?.sort_by?.toLowerCase() === "manual";
	const [searchQuery, setSearchQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
	const [filterOpen, setFilterOpen] = useState(false);
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

	const isRealView = !!activeViewId && !activeViewId.startsWith("__default-");
	const effectiveViewId = isManualSort && isRealView ? activeViewId : undefined;
	const isSprintColumnBacklog = isBacklog && activeViewConfig?.column_by === "sprint";
	const tasksQueryOpts = sprintId
		? sprintTasksQueryOptions(projectId, sprintId, effectiveViewId)
		: isSprintColumnBacklog
			? allTasksQueryOptions(projectId, effectiveViewId)
			: backlogTasksQueryOptions(projectId, effectiveViewId);
	const tasksQuery = useQuery(tasksQueryOpts);
	const tasks = tasksQuery.data?.items ?? [];
	const tasksLoading = tasksQuery.isLoading;

	const tasksBaseQueryKey = sprintId
		? ["projects", projectId, "sprints", sprintId, "tasks"]
		: isSprintColumnBacklog
			? ["projects", projectId, "all-tasks"]
			: ["projects", projectId, "backlog-tasks"];

	const { data: members = [] } = useQuery(
		projectMembersQueryOptions(projectId),
	);

	const { data: sprints = [] } = useQuery({
		...sprintsQueryOptions(projectId),
		enabled: isBacklog,
	});

	const viewCtx: ViewContext = useMemo(
		() => ({ statuses, taskTypes, members, customFields, sprints }),
		[statuses, taskTypes, members, customFields, sprints],
	);

	const sortedTasks = useMemo(() => {
		if (isManualSort) {
			return [...tasks].sort((a, b) => {
				const pa = a.view_position;
				const pb = b.view_position;
				if (pa != null && pb != null) return pa - pb;
				if (pa != null) return -1;
				if (pb != null) return 1;
				return a.created_at.localeCompare(b.created_at);
			});
		}
		return sortTasksByConfig(tasks, activeViewConfig, viewCtx);
	}, [isManualSort, tasks, activeViewConfig, viewCtx]);

	const selectedTask = useMemo(
		() => (selectedTaskId ? (sortedTasks.find((t) => t.id === selectedTaskId) ?? null) : null),
		[selectedTaskId, sortedTasks],
	);

	// Slice-by filter
	const [sliceValue, setSliceValue] = useState<string | null>(null);
	const activeSliceBy = activeViewConfig?.slice_by;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset slice when the field changes
	useEffect(() => {
		setSliceValue(null);
	}, [activeSliceBy]);

	const sliceFilteredTasks = useMemo(() => {
		if (!activeSliceBy || activeSliceBy === "none" || !sliceValue)
			return sortedTasks;
		return sortedTasks.filter((t) =>
			getTaskColumnKeys(t, activeSliceBy, viewCtx).includes(sliceValue),
		);
	}, [sortedTasks, activeSliceBy, sliceValue, viewCtx]);

	// Build slice options
	const sliceOptions = useMemo(() => {
		if (!activeSliceBy || activeSliceBy === "none") return [];
		return getColumnGroupDefs(activeSliceBy, viewCtx);
	}, [activeSliceBy, viewCtx]);

	const restoredFromUrl = useRef(false);
	useEffect(() => {
		if (restoredFromUrl.current || tasks.length === 0) return;
		try {
			const url = new URL(window.location.href);
			const taskId = url.searchParams.get("taskId");
			if (taskId) {
				const found = tasks.find((t) => t.id === taskId);
				if (found) {
					setSelectedTaskId(found.id);
					restoredFromUrl.current = true;
				}
			}
		} catch {
			/* ignore */
		}
	}, [tasks]);

	const handleTaskClick = (task: Task) => {
		setSelectedTaskId(task.id);
		onTaskClick?.(task);
		try {
			const url = new URL(window.location.href);
			url.searchParams.set("taskId", task.id);
			window.history.pushState({}, "", url.toString());
		} catch {
			/* ignore */
		}
	};

	const updateStatusMutation = useMutation({
		mutationFn: ({
			taskId,
			statusId,
			taskSprintId,
		}: {
			taskId: string;
			statusId: string;
			taskSprintId: string | null | undefined;
		}) =>
			updateTask(projectId, taskId, {
				status_id: statusId,
				sprint_id: taskSprintId ?? null,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: tasksBaseQueryKey }),
	});

	const handleStatusChange = useCallback(
		(taskId: string, newStatusId: string) => {
			const task = sortedTasks.find((t) => t.id === taskId);
			updateStatusMutation.mutate({
				taskId,
				statusId: newStatusId,
				taskSprintId: task?.sprint_id,
			});
		},
		[updateStatusMutation, sortedTasks],
	);

	const createTaskMutation = useMutation({
		mutationFn: async (payload: {
			title: string;
			statusId: string;
			taskTypeId?: string | null;
			extraFields?: TaskFieldUpdate;
		}) => {
			// sprint_id: prefer explicit extraFields.sprint_id, else fall back to route sprint param
			const sprintIdForTask =
				payload.extraFields?.sprint_id !== undefined
					? payload.extraFields.sprint_id
					: (sprintId ?? null);
			const task = await createTask(projectId, {
				title: payload.title,
				status_id: payload.statusId || undefined,
				sprint_id: sprintIdForTask,
				task_type_id: payload.taskTypeId ?? null,
			});
			// Apply remaining extraFields (excluding sprint_id which was handled above)
			const { sprint_id: _sid, ...remainingFields } = payload.extraFields ?? {};
			if (Object.keys(remainingFields).length > 0) {
				return updateTask(projectId, task.id, remainingFields);
			}
			return task;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: tasksBaseQueryKey }),
	});

	const handleCreateTask = async (
		statusId: string,
		title: string,
		taskTypeId?: string | null,
		extraFields?: TaskFieldUpdate,
	) => {
		await createTaskMutation.mutateAsync({ title, statusId, taskTypeId, extraFields });
	};

	const handleReorderTask = useCallback(
		(groupKey: string, taskId: string, newIndex: number) => {
			if (!effectiveViewId) return;
			const groupTasks = sortedTasks.filter((t) => t.status_id === groupKey);
			const srcIdx = groupTasks.findIndex((t) => t.id === taskId);
			const reordered = [...groupTasks];
			if (srcIdx !== -1) {
				const [removed] = reordered.splice(srcIdx, 1);
				reordered.splice(newIndex, 0, removed);
			}

			// ── Virtual positions for unpositioned tasks ───────────────────────
			// Null-positioned tasks are ordered by created_at at the bottom of the
			// sorted list.  To compute correct midpoints when the drag lands next
			// to one of them, we assign each a virtual position that evenly fills
			// the range (lastPositionedValue, POSITION_MAX).  The virtual positions
			// are ordered by the tasks' slots in `reordered` (= their created_at
			// order, since only `taskId` was moved).
			const nullNonMoved = reordered.filter(
				(t) => t.view_position == null && t.id !== taskId,
			);
			const lastExplicit = reordered
				.filter((t) => t.view_position != null)
				.reduce((max, t) => Math.max(max, t.view_position!), 0);
			const virtualPosMap = new Map<string, number>();
			nullNonMoved.forEach((t, i) => {
				virtualPosMap.set(
					t.id,
					lastExplicit +
						((POSITION_MAX - lastExplicit) * (i + 1)) /
							(nullNonMoved.length + 1),
				);
			});
			const effectivePos = (t: Task): number =>
				t.view_position ?? virtualPosMap.get(t.id) ?? POSITION_MAX / 2;

			// ── Compute new position using bounded midpoint rules ──────────────
			const prevTask = reordered[newIndex - 1];
			const nextTask = reordered[newIndex + 1];
			const prev = prevTask ? effectivePos(prevTask) : null;
			const next = nextTask ? effectivePos(nextTask) : null;

			let position: number;
			if (prev !== null && next !== null) {
				// Midpoint between neighbours — stays inside (prev, next).
				position = (prev + next) / 2;
			} else if (prev !== null) {
				// Append: midpoint toward ceiling — always < POSITION_MAX.
				position = (prev + POSITION_MAX) / 2;
			} else if (next !== null) {
				// Prepend: midpoint toward zero — always > 0.
				position = next / 2;
			} else {
				// Sole task in an all-null group — centre of the full range.
				position = POSITION_MAX / 2;
			}

			// ── Build update list ──────────────────────────────────────────────
			// If the drag landed next to at least one null-positioned task, also
			// materialise all null tasks so their DB positions match the order the
			// user established (otherwise they revert to created_at on re-render).
			const updates: Array<{ id: string; pos: number }> = [
				{ id: taskId, pos: position },
			];
			const hasNullNeighbour =
				(prevTask?.view_position == null && prevTask?.id !== taskId) ||
				(nextTask?.view_position == null && nextTask?.id !== taskId);
			if (hasNullNeighbour) {
				for (const [id, pos] of virtualPosMap.entries()) {
					updates.push({ id, pos });
				}
			}

			const bulkItems = updates.map((u) => ({
				task_id: u.id,
				position: u.pos,
				group_key: groupKey,
			}));
			const bulkCall = sprintId
				? bulkMoveTaskPositions(projectId, sprintId, effectiveViewId, bulkItems)
				: bulkMoveBacklogTaskPositions(projectId, effectiveViewId, bulkItems);

			bulkCall
				.then(() => qc.invalidateQueries({ queryKey: tasksBaseQueryKey }))
				.catch(console.error);
		},
		[effectiveViewId, sortedTasks, sprintId, projectId, qc, tasksBaseQueryKey],
	);

	const handleMoveToColumn = useCallback(
		(taskId: string, update: TaskFieldUpdate) => {
			updateTask(projectId, taskId, update)
				.then((updatedTask) => {
					// Write the server response directly into the per-task cache so the
					// detail modal immediately shows the updated value without a separate fetch.
					qc.setQueryData(["projects", projectId, "tasks", taskId], updatedTask);
					return qc.invalidateQueries({ queryKey: tasksBaseQueryKey });
				})
				.catch(console.error);
		},
		[projectId, qc, tasksBaseQueryKey],
	);

	const createViewMutation = useMutation({
		mutationFn: (payload: { name: string; layout: ViewLayout }) => {
			const view_type = layoutToViewType(payload.layout);
			return sprintId
				? createView(projectId, sprintId, { name: payload.name, view_type })
				: createBacklogView(projectId, { name: payload.name, view_type });
		},
		onSuccess: (view) => {
			qc.invalidateQueries({ queryKey: viewsQueryKey });
			setPreferredViewId(view.id);
		},
	});

	const renameViewMutation = useMutation({
		mutationFn: (payload: { viewId: string; name: string }) =>
			sprintId
				? updateView(projectId, sprintId, payload.viewId, {
						name: payload.name,
					})
				: updateBacklogView(projectId, payload.viewId, { name: payload.name }),
		onSuccess: () => qc.invalidateQueries({ queryKey: viewsQueryKey }),
	});

	const updateViewConfigMutation = useMutation({
		mutationFn: (payload: { viewId: string; config: ViewConfig }) =>
			sprintId
				? updateView(projectId, sprintId, payload.viewId, {
						config: payload.config,
					})
				: updateBacklogView(projectId, payload.viewId, {
						config: payload.config,
					}),
		onSuccess: () => {
			setPreviewConfig(undefined);
			qc.invalidateQueries({ queryKey: viewsQueryKey });
		},
	});

	const deleteViewMutation = useMutation({
		mutationFn: (viewId: string) =>
			sprintId
				? deleteView(projectId, sprintId, viewId)
				: deleteBacklogView(projectId, viewId),
		onSuccess: (_, deletedId) => {
			qc.invalidateQueries({ queryKey: viewsQueryKey });
			if (preferredViewId === deletedId) {
				const remaining = views.filter((v) => v.id !== deletedId);
				setPreferredViewId(remaining[0]?.id ?? "");
			}
		},
	});

	const reorderViewMutation = useMutation({
		mutationFn: (orderedIds: string[]) =>
			sprintId
				? reorderViews(projectId, sprintId, orderedIds)
				: reorderBacklogViews(projectId, orderedIds),
		onSuccess: () => qc.invalidateQueries({ queryKey: viewsQueryKey }),
	});

	const [tabDragId, setTabDragId] = useState<string | null>(null);
	const [tabDragOverId, setTabDragOverId] = useState<string | null>(null);
	const [localViews, setLocalViews] = useState<IntegrationView[] | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset local order when server views refresh
	useEffect(() => {
		if (!tabDragId) setLocalViews(null);
	}, [views]);

	const displayViews = localViews ?? views;

	const handleTabDrop = (targetId: string, draggedId: string) => {
		if (!draggedId || draggedId === targetId) return;
		const current = localViews ?? views;
		const srcIdx = current.findIndex((v) => v.id === draggedId);
		const tgtIdx = current.findIndex((v) => v.id === targetId);
		if (srcIdx === -1 || tgtIdx === -1) return;
		const next = [...current];
		const [moved] = next.splice(srcIdx, 1);
		next.splice(tgtIdx, 0, moved);
		const withPositions = next.map((v, i) => ({ ...v, position: i }));
		setLocalViews(withPositions);
		reorderViewMutation.mutate(withPositions.map((v) => v.id));
	};

	// ── Sprint management (backlog only) ────────────────────────────────────
	const createSprintMutation = useMutation({
		mutationFn: (name: string) =>
			createSprint(projectId, { name, status: "planned" }),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["projects", projectId, "sprints"] }),
	});

	const handleNewSprint = () => {
		const nextNum = sprints.length + 1;
		createSprintMutation.mutate(`Sprint ${nextNum}`);
	};

	const updateSprintMutation = useMutation({
		mutationFn: ({
			sprintId: sid,
			payload,
		}: {
			sprintId: string;
			payload: Parameters<typeof updateSprint>[2];
		}) => updateSprint(projectId, sid, payload),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["projects", projectId, "sprints"] });
		},
	});

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Header */}
			<div className="shrink-0 border-b border-border/30 px-8 py-5">
				<div className="flex items-center gap-3">
					<h1 className="font-[Syne] text-[26px] font-bold tracking-tight flex-1">
						{title}
					</h1>
					{headerActions}
					{isBacklog && canCreate && (
						<button
							type="button"
							onClick={handleNewSprint}
							disabled={createSprintMutation.isPending}
							className="flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all duration-150 disabled:opacity-50"
						>
							<Plus className="size-3.5 shrink-0" />
							New sprint
						</button>
					)}
				</div>
				{description && (
					<p className="mt-1 text-[13px] text-muted-foreground">
						{description}
					</p>
				)}
			</div>

			{/* View tab bar */}
			<div className="flex shrink-0 items-center gap-1 border-b border-border/25 bg-muted/20 px-4">
				<div className="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden flex-1 min-w-0">
					{displayViews.map((view) => {
						const isActive = view.id === activeView?.id;
						const isDragOver =
							tabDragOverId === view.id && tabDragId !== view.id;
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: draggable tab; pointer events only
							<div
								key={view.id}
								draggable={canManageViews}
								className={cn(
									"relative flex items-center shrink-0 transition-all duration-100",
									isActive && "border-b-2 border-primary -mb-px",
									isDragOver && "border-l-2 border-primary/60",
									tabDragId === view.id && "opacity-40",
									canManageViews && "cursor-grab active:cursor-grabbing",
								)}
								onDragStart={(e) => {
									setTabDragId(view.id);
									e.dataTransfer.effectAllowed = "move";
									e.dataTransfer.setData("text/plain", view.id);
								}}
								onDragEnd={() => {
									setTabDragId(null);
									setTabDragOverId(null);
								}}
								onDragOver={(e) => {
									if (!canManageViews) return;
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
									setTabDragOverId(view.id);
								}}
								onDragLeave={() => {
									if (tabDragOverId === view.id) setTabDragOverId(null);
								}}
								onDrop={(e) => {
									e.preventDefault();
									const draggedId = e.dataTransfer.getData("text/plain");
									setTabDragId(null);
									setTabDragOverId(null);
									handleTabDrop(view.id, draggedId);
								}}
							>
								<button
									type="button"
									onClick={() => setPreferredViewId(view.id)}
									className={cn(
										"flex items-center gap-1.5 px-2.5 py-2.5 text-[12px] font-medium transition-all duration-150",
										isActive
											? "text-primary"
											: "text-muted-foreground/80 hover:text-foreground",
									)}
								>
									{view.layout === "Board" ? (
										<KanbanSquare className="size-3.5" />
									) : view.layout === "Roadmap" ? (
										<MapIcon className="size-3.5" />
									) : (
										<List className="size-3.5" />
									)}
									{view.name}
								</button>

								{isActive && (
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<button
													type="button"
													className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all duration-150"
												/>
											}
										>
											<ChevronDown className="size-3" />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="start" sideOffset={4}>
											<DropdownMenuItem
												onSelect={() => {
													setRenameTarget(view);
													setRenameOpen(true);
												}}
											>
												Rename view
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												disabled={views.length <= 1}
												onSelect={() => deleteViewMutation.mutate(view.id)}
												className="text-destructive focus:text-destructive"
											>
												Delete view
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</div>
						);
					})}

					{canManageViews && (
						<NewViewPopover
							onSubmit={(name, layout) =>
								createViewMutation.mutateAsync({ name, layout })
							}
							isPending={createViewMutation.isPending}
						/>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-1 pl-3 border-l border-border/25 ml-2">
					{searchOpen ? (
						<div className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-muted/15 px-3 py-1.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition-all duration-150">
							<Search className="size-3.5 text-muted-foreground/60 shrink-0" />
							<input
								ref={searchRef}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search tasks…"
								className="w-36 bg-transparent text-[12px] font-medium outline-none placeholder:text-muted-foreground/50"
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										setSearchOpen(false);
										setSearchQuery("");
									}
								}}
							/>
							<button
								type="button"
								onClick={() => {
									setSearchOpen(false);
									setSearchQuery("");
								}}
								className="flex size-5 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground transition-all duration-150"
							>
								<X className="size-3" />
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setSearchOpen(true)}
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all duration-150"
						>
							<Search className="size-3.5" />
						</button>
					)}

					{/* Assignee filter */}
					<Popover open={filterOpen} onOpenChange={setFilterOpen}>
						<PopoverTrigger
							render={
								<button
									type="button"
									className={cn(
										"flex size-7 items-center justify-center rounded-md transition-all duration-150",
										assigneeFilter
											? "bg-primary/8 text-primary/80"
											: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/60",
									)}
								/>
							}
						>
							<SlidersHorizontal className="size-3.5" />
						</PopoverTrigger>
						<PopoverContent
							side="bottom"
							align="end"
							className="w-52 p-1 rounded-xl border border-border/40 shadow-lg"
							sideOffset={6}
						>
							<div className="px-3 py-2 border-b border-border/30">
								<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
									Filter by assignee
								</p>
							</div>
							<div className="flex flex-col py-1 max-h-52 overflow-y-auto">
								<button
									type="button"
									onClick={() => {
										setAssigneeFilter(null);
										setFilterOpen(false);
									}}
									className={cn(
										"flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100 text-left",
										!assigneeFilter && "text-primary font-medium",
									)}
								>
									All assignees
								</button>
								{members.map((m) => (
									<button
										key={m.id}
										type="button"
										onClick={() => {
											setAssigneeFilter(m.id);
											setFilterOpen(false);
										}}
										className={cn(
											"flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100 text-left",
											assigneeFilter === m.id &&
												"text-primary font-medium",
										)}
									>
										<div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10 text-primary text-[10px] font-bold ring-1 ring-primary/20">
											{(m.full_name || m.username).slice(0, 1).toUpperCase()}
										</div>
										<span className="truncate">
											{m.full_name || m.username}
										</span>
									</button>
								))}
								{members.length === 0 && (
									<p className="px-3 py-2 text-[12px] text-muted-foreground/50">
										No members
									</p>
								)}
							</div>
							{assigneeFilter && (
								<div className="border-t border-border/30 p-1">
									<button
										type="button"
										onClick={() => {
											setAssigneeFilter(null);
											setFilterOpen(false);
										}}
										className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground transition-colors duration-100"
									>
										<X className="size-3.5 text-muted-foreground/80 shrink-0" />
										Clear filter
									</button>
								</div>
							)}
						</PopoverContent>
					</Popover>

					{activeView && (
						<ViewSettingsPanel
							projectId={projectId}
							view={activeView}
							open={settingsOpen}
							onOpenChange={setSettingsOpen}
							onSave={(viewId, config) =>
								updateViewConfigMutation.mutateAsync({ viewId, config })
							}
							onPreview={setPreviewConfig}
							isPending={updateViewConfigMutation.isPending}
						/>
					)}
				</div>
			</div>

			{/* Slice-by selector strip */}
			{activeSliceBy && activeSliceBy !== "none" && sliceOptions.length > 0 && (
				<div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-1.5 border-b border-border/20 bg-muted/10">
					<span className="text-[11px] font-semibold text-muted-foreground/60 shrink-0 mr-1">
						Slice:
					</span>
					<button
						type="button"
						onClick={() => setSliceValue(null)}
						className={cn(
							"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all duration-150",
							!sliceValue
								? "bg-primary text-primary-foreground"
								: "bg-muted/40 text-muted-foreground hover:bg-muted/70",
						)}
					>
						All
					</button>
					{sliceOptions.map((opt) => (
						<button
							key={opt.key}
							type="button"
							onClick={() => setSliceValue(sliceValue === opt.key ? null : opt.key)}
							className={cn(
								"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all duration-150",
								sliceValue === opt.key
									? "bg-primary text-primary-foreground"
									: "bg-muted/40 text-muted-foreground hover:bg-muted/70",
							)}
						>
							{opt.label}
						</button>
					))}
				</div>
			)}

			{/* View content */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{tasksLoading ? (
					<div className="flex h-full items-center justify-center">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : activeView?.layout === "Board" ? (
					<BoardView
						projectId={projectId}
						taskIdPrefix={taskIdPrefix}
						tasks={sliceFilteredTasks}
						statuses={statuses}
						taskTypes={creatableTaskTypes}
						members={members}
						customFields={customFields}
						sprints={sprints}
						viewConfig={activeViewConfig}
						canCreate={canCreate}
						canEdit={canEdit}
						searchQuery={searchQuery}
						assigneeFilter={assigneeFilter}
						tasksQueryKey={tasksBaseQueryKey}
						onCreateTask={handleCreateTask}
						onTaskClick={handleTaskClick}
						onUpdateTask={canEdit ? handleMoveToColumn : undefined}
						onMoveToColumn={canEdit ? handleMoveToColumn : undefined}
						manualSort={isManualSort}
						onReorderTask={effectiveViewId ? handleReorderTask : undefined}
					/>
				) : activeView?.layout === "Roadmap" ? (
					<RoadmapView
						tasks={tasks}
						taskIdPrefix={taskIdPrefix}
						statuses={statuses}
						taskTypes={taskTypes}
						searchQuery={searchQuery}
						assigneeFilter={assigneeFilter}
						onTaskClick={handleTaskClick}
					/>
				) : (
					<ListView
						tasks={sliceFilteredTasks}
						taskIdPrefix={taskIdPrefix}
						statuses={statuses}
						taskTypes={creatableTaskTypes}
						members={members}
						customFields={customFields}
						viewConfig={activeViewConfig}
						canCreate={canCreate}
						searchQuery={searchQuery}
						assigneeFilter={assigneeFilter}
						onCreateTask={handleCreateTask}
						onTaskClick={handleTaskClick}
						manualSort={isManualSort}
						onReorderTask={effectiveViewId ? handleReorderTask : undefined}
						onStatusChange={canEdit ? handleStatusChange : undefined}
						canEdit={canEdit}
						sortBy={activeViewConfig?.sort_by}
						onUpdateTaskField={canEdit ? handleMoveToColumn : undefined}
						sprints={isBacklog ? sprints : undefined}
						onStartSprint={
							isBacklog && canCreate
								? async (sid, payload) => {
										await updateSprintMutation.mutateAsync({ sprintId: sid, payload });
										navigate({
											to: "/projects/$projectId/integrations/sprints/$sprintId",
											params: { projectId, sprintId: sid },
										});
									}
								: undefined
						}
						onCreateSprint={isBacklog && canCreate ? handleNewSprint : undefined}
					/>
				)}
			</div>

			<RenameViewDialog
				view={renameTarget}
				open={renameOpen}
				onOpenChange={(v) => {
					setRenameOpen(v);
					if (!v) setRenameTarget(null);
				}}
				onSubmit={(viewId, name) =>
					renameViewMutation.mutateAsync({ viewId, name })
				}
				isPending={renameViewMutation.isPending}
			/>

			<TaskDetailModal
				task={selectedTask}
				open={!!selectedTask}
				onOpenChange={(v) => {
					if (!v) {
						setSelectedTaskId(null);
						try {
							const url = new URL(window.location.href);
							url.searchParams.delete("taskId");
							window.history.pushState({}, "", url.toString());
						} catch {
							/* ignore */
						}
					}
				}}
				projectId={projectId}
				statuses={statuses}
				taskTypes={taskTypes}
				members={members}
			/>
		</div>
	);
}
