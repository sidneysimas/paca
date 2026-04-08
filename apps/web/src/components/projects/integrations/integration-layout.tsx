import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, KanbanSquare, List, Map, Plus, Search, Settings, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
	createBacklogView,
	createView,
	deleteBacklogView,
	deleteView,
	updateBacklogView,
	updateView,
	backlogViewsQueryOptions,
	createTask,
	layoutToViewType,
	viewsQueryOptions,
	type IntegrationView,
	type Task,
	type ViewConfig,
	type ViewLayout,
} from "@/lib/integration-api";
import {
	projectMembersQueryOptions,
	taskStatusesQueryOptions,
	taskTypesQueryOptions,
} from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { RoadmapView } from "./roadmap-view";
import { TaskDetailPanel } from "./task-detail-panel";

interface IntegrationLayoutProps {
	projectId: string;
	integrationKey: string;
	title: string;
	description?: string | null;
	tasksQueryKey: unknown[];
	tasks: Task[];
	tasksLoading: boolean;
	canCreate: boolean;
	canEdit: boolean;
	canManageViews: boolean;
	onTaskClick?: (task: Task) => void;
	sprintId?: string | null;
}

// ── New View Popover ───────────────────────────────────────────────────────────
function NewViewPopover({
	onSubmit,
	isPending,
}: {
	onSubmit: (name: string, layout: ViewLayout) => Promise<unknown>;
	isPending?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [layout, setLayout] = useState<ViewLayout>("Board");

	const submit = async () => {
		await onSubmit(name || `New ${layout}`, layout);
		setName("");
		setOpen(false);
	};

	const layoutIcon = (l: ViewLayout) => {
		if (l === "Board") return <KanbanSquare className="size-3.5" />;
		if (l === "Roadmap") return <Map className="size-3.5" />;
		return <List className="size-3.5" />;
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label="Add view"
						className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
					/>
				}
			>
				<Plus className="size-3.5" />
				<span className="hidden sm:inline">Add view</span>
			</PopoverTrigger>
			<PopoverContent side="bottom" align="end" className="w-64 p-0 gap-0" sideOffset={6}>
				<div className="p-3 border-b border-border/50">
					<p className="text-xs font-semibold">New view</p>
				</div>
				<div className="p-3 flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<label className="text-xs text-muted-foreground">View name</label>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && submit()}
							placeholder={`New ${layout}`}
							className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="text-xs text-muted-foreground">Layout</label>
						<div className="flex gap-2">
							{(["Board", "Table", "Roadmap"] as ViewLayout[]).map((l) => (
								<button
									key={l}
									type="button"
									onClick={() => setLayout(l)}
									className={cn(
										"flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors",
										layout === l
											? "border-primary bg-primary/10 text-primary"
											: "border-border text-muted-foreground hover:text-foreground",
									)}
								>
									{layoutIcon(l)}
									{l}
								</button>
							))}
						</div>
					</div>
					<button
						type="button"
						onClick={submit}
						disabled={isPending}
						className="w-full rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
					>
						{isPending ? "Creating…" : "Create view"}
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ── Rename Dialog ──────────────────────────────────────────────────────────────
function RenameViewDialog({
	view,
	open,
	onOpenChange,
	onSubmit,
	isPending,
}: {
	view: IntegrationView | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (viewId: string, name: string) => Promise<unknown>;
	isPending?: boolean;
}) {
	const [name, setName] = useState(view?.name ?? "");

	useEffect(() => {
		if (view) setName(view.name);
	}, [view]);

	const submit = async () => {
		if (!view || !name.trim()) return;
		await onSubmit(view.id, name.trim());
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xs">
				<DialogHeader>
					<DialogTitle>Rename view</DialogTitle>
				</DialogHeader>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && submit()}
					className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
				/>
				<DialogFooter>
					<DialogClose
						render={<Button variant="outline" size="sm" />}
					>
						Cancel
					</DialogClose>
					<Button size="sm" disabled={!name.trim() || isPending} onClick={submit}>
						{isPending ? "Renaming…" : "Rename"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ── View Settings Panel ────────────────────────────────────────────────────────
const SORT_OPTIONS = ["Manual", "Priority", "Title", "Created"];
const FIELD_SUM_OPTIONS = ["Count", "Story Points"];
const COLUMN_BY_OPTIONS = ["Status", "Assignee", "Priority"];
const SWIMLANE_OPTIONS = ["None", "Assignee", "Priority", "Type"];
const SLICE_BY_OPTIONS = ["None", "Assignee", "Priority", "Type"];

function ViewSettingsPanel({
	view,
	open,
	onOpenChange,
	onSave,
	onPreview,
	isPending,
}: {
	view: IntegrationView | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (viewId: string, config: ViewConfig) => Promise<unknown>;
	onPreview: (config: ViewConfig) => void;
	isPending?: boolean;
}) {
	const [draft, setDraft] = useState<ViewConfig>(() => view?.config ?? {});

	// Reset draft whenever the panel opens (re-sync from saved config)
	useEffect(() => {
		if (open) setDraft(view?.config ?? {});
	}, [open, view?.id]); // eslint-disable-line react-hooks/exhaustive-deps

	// Propagate draft to parent so the view previews immediately
	useEffect(() => {
		if (open) onPreview(draft);
	}, [draft, open]); // eslint-disable-line react-hooks/exhaustive-deps

	// On close without Save: revert preview to saved config
	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen && view) onPreview(view.config ?? {});
		onOpenChange(newOpen);
	};

	const update = (patch: Partial<ViewConfig>) => {
		setDraft((prev) => ({ ...prev, ...patch }));
	};

	const handleSave = async () => {
		if (!view) return;
		await onSave(view.id, draft);
		onOpenChange(false);
	};

	const handleReset = () => {
		const saved = view?.config ?? {};
		setDraft(saved);
		onPreview(saved);
	};

	const row = (label: string, children: React.ReactNode) => (
		<div className="flex items-center justify-between gap-3 py-1.5">
			<span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
			{children}
		</div>
	);

	const select = (
		value: string | undefined,
		options: string[],
		onChange: (v: string) => void,
		placeholder = "Default",
	) => (
		<select
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value)}
			className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
		>
			<option value="">{placeholder}</option>
			{options.map((o) => (
				<option key={o} value={o.toLowerCase()}>{o}</option>
			))}
		</select>
	);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label="View settings"
						className={cn(
							"flex size-7 items-center justify-center rounded-md transition-colors",
							open
								? "bg-primary/10 text-primary"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
						)}
					/>
				}
			>
				<Settings className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent side="bottom" align="end" className="w-72 p-0 gap-0" sideOffset={6}>
				<div className="px-3 py-2.5 border-b border-border/50">
					<p className="text-xs font-semibold">View settings</p>
				</div>
				<div className="p-3 flex flex-col divide-y divide-border/30">
					{row("Fields", (
						<span className="text-xs text-foreground flex-1 truncate">
							{draft.fields?.join(", ") || "Title, Assignees, Status"}
						</span>
					))}
					{row("Column by", select(draft.column_by, COLUMN_BY_OPTIONS, (v) => update({ column_by: v }), "Status"))}
					{row("Swimlanes", select(draft.swimlanes, SWIMLANE_OPTIONS, (v) => update({ swimlanes: v }), "None"))}
					{row("Sort by", select(draft.sort_by, SORT_OPTIONS, (v) => update({ sort_by: v }), "Default"))}
					{row("Field sum", select(draft.field_sum, FIELD_SUM_OPTIONS, (v) => update({ field_sum: v }), "Count"))}
					{row("Slice by", select(draft.slice_by, SLICE_BY_OPTIONS, (v) => update({ slice_by: v }), "None"))}
				</div>
				<div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-border/50">
					<button
						type="button"
						onClick={handleReset}
						className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
					>
						Reset
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={isPending}
						className="px-3 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
					>
						{isPending ? "Saving…" : "Save"}
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ── Main Layout ────────────────────────────────────────────────────────────────
export function IntegrationLayout({
	projectId,
	integrationKey,
	title,
	description,
	tasksQueryKey,
	tasks,
	tasksLoading,
	canCreate,
	canEdit,
	canManageViews,
	onTaskClick,
	sprintId,
}: IntegrationLayoutProps) {
	const qc = useQueryClient();

	const { data: statuses = [] } = useQuery(taskStatusesQueryOptions(projectId));
	const { data: taskTypes = [] } = useQuery(taskTypesQueryOptions(projectId));

	// Load views from the API (backlog or sprint)
	const viewsQuery = useQuery(
		sprintId
			? viewsQueryOptions(projectId, sprintId)
			: backlogViewsQueryOptions(projectId),
	);

	const FALLBACK_VIEWS: IntegrationView[] = [
		{ id: "__default-board__", name: "Board", view_type: "board", layout: "Board" },
		{ id: "__default-table__", name: "Table", view_type: "table", layout: "Table" },
	];
	const serverViews = viewsQuery.data ?? [];
	const views = serverViews.length > 0 ? serverViews : (viewsQuery.isSuccess ? FALLBACK_VIEWS : []);

	const viewsQueryKey = sprintId
		? viewsQueryOptions(projectId, sprintId).queryKey
		: backlogViewsQueryOptions(projectId).queryKey;

	// Active view: prefer last-selected (stored in localStorage), fall back to first
	const [preferredViewId, setPreferredViewId] = useState<string>(() => {
		try {
			return localStorage.getItem(`paca:active-view:${integrationKey}`) ?? "";
		} catch { return ""; }
	});

	const activeView = views.find((v) => v.id === preferredViewId) ?? views[0];
	const activeViewId = activeView?.id ?? "";

	// Persist active view preference
	useEffect(() => {
		if (!activeViewId) return;
		try {
			localStorage.setItem(`paca:active-view:${integrationKey}`, activeViewId);
		} catch { /* ignore */ }
	}, [activeViewId, integrationKey]);

	const [renameTarget, setRenameTarget] = useState<IntegrationView | null>(null);
	const [renameOpen, setRenameOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	// Previewed view config (updated by the settings panel before Save)
	const [previewConfig, setPreviewConfig] = useState<ViewConfig | undefined>(undefined);
	const activeViewConfig = previewConfig ?? activeView?.config;
	const isManualSort = activeViewConfig?.sort_by?.toLowerCase() === "manual";
	const [searchQuery, setSearchQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
	const [filterOpen, setFilterOpen] = useState(false);
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);

	const { data: members = [] } = useQuery(projectMembersQueryOptions(projectId));

	const handleTaskClick = (task: Task) => {
		setSelectedTask(task);
		onTaskClick?.(task);
	};

	// ── Task mutation ─────────────────────────────────────────────────────────
	const createTaskMutation = useMutation({
		mutationFn: (payload: { title: string; statusId: string }) =>
			createTask(projectId, {
				title: payload.title,
				status_id: payload.statusId,
				sprint_id: sprintId ?? null,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: tasksQueryKey }),
	});

	const handleCreateTask = async (statusId: string, title: string) => {
		await createTaskMutation.mutateAsync({ title, statusId });
	};

	// ── View mutations ────────────────────────────────────────────────────────
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
				? updateView(projectId, sprintId, payload.viewId, { name: payload.name })
				: updateBacklogView(projectId, payload.viewId, { name: payload.name }),
		onSuccess: () => qc.invalidateQueries({ queryKey: viewsQueryKey }),
	});

	const updateViewConfigMutation = useMutation({
		mutationFn: (payload: { viewId: string; config: ViewConfig }) =>
			sprintId
				? updateView(projectId, sprintId, payload.viewId, { config: payload.config })
				: updateBacklogView(projectId, payload.viewId, { config: payload.config }),
		onSuccess: () => {
			// After save, clear preview so the view uses the server-returned config
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

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Header */}
			<div className="shrink-0 border-b border-border/50 px-6 py-4">
				<h1 className="font-[Syne] text-xl font-bold tracking-tight">{title}</h1>
				{description && (
					<p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
				)}
			</div>

			{/* View tab bar */}
			<div className="flex shrink-0 items-center gap-1 border-b border-border/40 px-4">
				<div className="flex items-center gap-0.5 overflow-x-auto overflow-y-hidden flex-1 min-w-0">
					{views.map((view) => {
						const isActive = view.id === activeView?.id;
						return (
							<div
								key={view.id}
								className={cn(
									"relative flex items-center shrink-0",
									isActive && "border-b-2 border-primary -mb-px",
								)}
							>
								<button
									type="button"
									onClick={() => setPreferredViewId(view.id)}
									className={cn(
										"flex items-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-all duration-150",
										isActive
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{view.layout === "Board" ? (
										<KanbanSquare className="size-3.5" />
									) : view.layout === "Roadmap" ? (
										<Map className="size-3.5" />
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
													className="flex size-5 items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
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

					{/* Add view — sits immediately after the last tab */}
					{canManageViews && (
						<NewViewPopover
							onSubmit={(name, layout) => createViewMutation.mutateAsync({ name, layout })}
							isPending={createViewMutation.isPending}
						/>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-1 pl-2 border-l border-border/30 ml-1">
					{searchOpen ? (
						<div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
							<Search className="size-3.5 text-muted-foreground shrink-0" />
							<input
								ref={searchRef}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search tasks…"
								autoFocus
								className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										setSearchOpen(false);
										setSearchQuery("");
									}
								}}
							/>
							<button
								type="button"
								onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
								className="text-muted-foreground hover:text-foreground"
							>
								<X className="size-3" />
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setSearchOpen(true)}
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
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
										"flex size-7 items-center justify-center rounded-md transition-colors",
										assigneeFilter
											? "bg-primary/10 text-primary"
											: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
									)}
								/>
							}
						>
							<SlidersHorizontal className="size-3.5" />
						</PopoverTrigger>
						<PopoverContent side="bottom" align="end" className="w-52 p-0" sideOffset={6}>
							<div className="p-2 border-b border-border/50">
								<p className="text-xs font-semibold">Filter by assignee</p>
							</div>
							<div className="flex flex-col py-1 max-h-52 overflow-y-auto">
								<button
									type="button"
									onClick={() => { setAssigneeFilter(null); setFilterOpen(false); }}
									className={cn(
										"flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors text-left",
										!assigneeFilter && "text-primary font-medium",
									)}
								>
									All assignees
								</button>
								{members.map((m) => (
									<button
										key={m.user_id}
										type="button"
										onClick={() => { setAssigneeFilter(m.user_id); setFilterOpen(false); }}
										className={cn(
											"flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors text-left",
											assigneeFilter === m.user_id && "text-primary font-medium",
										)}
									>
										<div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-bold">
											{(m.full_name || m.username).slice(0, 1).toUpperCase()}
										</div>
										<span className="truncate">{m.full_name || m.username}</span>
									</button>
								))}
								{members.length === 0 && (
									<p className="px-3 py-2 text-xs text-muted-foreground/50">No members</p>
								)}
							</div>
							{assigneeFilter && (
								<div className="border-t border-border/50 p-2">
									<button
										type="button"
										onClick={() => { setAssigneeFilter(null); setFilterOpen(false); }}
										className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
									>
										<X className="size-3" />
										Clear filter
									</button>
								</div>
							)}
						</PopoverContent>
					</Popover>

					{/* View settings — always visible when at least one view is active */}
					{activeView && (
						<ViewSettingsPanel
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

			{/* View content */}
			<div className="flex-1 overflow-hidden">
				{tasksLoading ? (
					<div className="flex h-full items-center justify-center">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : activeView?.layout === "Board" ? (
					<BoardView
						projectId={projectId}
						tasks={tasks}
						statuses={statuses}
						taskTypes={taskTypes}
						canCreate={canCreate}
						canEdit={canEdit}
						searchQuery={searchQuery}
						assigneeFilter={assigneeFilter}
						tasksQueryKey={tasksQueryKey}
						onCreateTask={handleCreateTask}
						onTaskClick={handleTaskClick}
						manualSort={isManualSort}
					/>
				) : activeView?.layout === "Roadmap" ? (
					<RoadmapView
						tasks={tasks}
						statuses={statuses}
						taskTypes={taskTypes}
						searchQuery={searchQuery}
						assigneeFilter={assigneeFilter}
						onTaskClick={handleTaskClick}
					/>
				) : (
					<ListView
						tasks={tasks}
						statuses={statuses}
						taskTypes={taskTypes}
						canCreate={canCreate}
						searchQuery={searchQuery}
						assigneeFilter={assigneeFilter}
						onCreateTask={handleCreateTask}
						onTaskClick={handleTaskClick}
						manualSort={isManualSort}
					/>
				)}
			</div>

			{/* Rename dialog (state-controlled) */}
			<RenameViewDialog
				view={renameTarget}
				open={renameOpen}
				onOpenChange={(v) => { setRenameOpen(v); if (!v) setRenameTarget(null); }}
				onSubmit={(viewId, name) => renameViewMutation.mutateAsync({ viewId, name })}
				isPending={renameViewMutation.isPending}
			/>

			{/* Task detail panel */}
			<TaskDetailPanel
				task={selectedTask}
				open={!!selectedTask}
				onOpenChange={(v) => { if (!v) setSelectedTask(null); }}
				statuses={statuses}
				taskTypes={taskTypes}
			/>
		</div>
	);
}
