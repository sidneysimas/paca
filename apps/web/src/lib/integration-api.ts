import { queryOptions } from "@tanstack/react-query";

import { apiClient } from "./api-client";
import type { SuccessEnvelope } from "./api-error";

// ── Shapes ────────────────────────────────────────────────────────────────────

export type SprintStatus = "planned" | "active" | "completed";

export interface Sprint {
	id: string;
	project_id: string;
	name: string;
	start_date?: string | null;
	end_date?: string | null;
	goal?: string | null;
	status: SprintStatus;
	created_at: string;
	updated_at: string;
}

export interface SprintListResult {
	items: Sprint[];
}

export interface Task {
	id: string;
	project_id: string;
	title: string;
	task_type_id?: string | null;
	status_id?: string | null;
	sprint_id?: string | null;
	parent_task_id?: string | null;
	description?: string | null;
	importance: number;
	board_position: number;
	assignee_id?: string | null;
	reporter_id?: string | null;
	custom_fields: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface TaskListResult {
	items: Task[];
	total: number;
	page: number;
	page_size: number;
}

// ── View types ─────────────────────────────────────────────────────────────────
export type ViewType = "table" | "board" | "roadmap";

export interface ViewConfig {
	fields?: string[];
	column_by?: string;
	swimlanes?: string;
	sort_by?: string;
	field_sum?: string;
	slice_by?: string;
}

export interface IntegrationView {
	id: string;
	name: string;
	view_type: ViewType;
	config?: ViewConfig;
}

// ── Client-side view storage (localStorage, used for backlog) ──────────────────
const VIEWS_STORAGE_KEY = "paca:integration-views-v2";

function getViewsStorage(): Record<string, IntegrationView[]> {
	try {
		const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function saveViewsStorage(data: Record<string, IntegrationView[]>): void {
	localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(data));
}

export function getIntegrationViews(integrationKey: string): IntegrationView[] {
	const store = getViewsStorage();
	if (store[integrationKey]?.length) return store[integrationKey];
	const defaults: IntegrationView[] = [
		{ id: "default-board", name: "Board", view_type: "board" },
		{ id: "default-table", name: "Table", view_type: "table" },
	];
	store[integrationKey] = defaults;
	saveViewsStorage(store);
	return defaults;
}

export function createLocalView(
	integrationKey: string,
	name: string,
	viewType: ViewType,
): IntegrationView {
	const store = getViewsStorage();
	const views = store[integrationKey] ?? [];
	const id = `view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const label = viewType.charAt(0).toUpperCase() + viewType.slice(1);
	const newView: IntegrationView = {
		id,
		name: name || `New ${label}`,
		view_type: viewType,
	};
	store[integrationKey] = [...views, newView];
	saveViewsStorage(store);
	return newView;
}

export function renameLocalView(
	integrationKey: string,
	viewId: string,
	newName: string,
): void {
	const store = getViewsStorage();
	const views = store[integrationKey] ?? [];
	store[integrationKey] = views.map((v) =>
		v.id === viewId ? { ...v, name: newName } : v,
	);
	saveViewsStorage(store);
}

export function deleteLocalView(integrationKey: string, viewId: string): void {
	const store = getViewsStorage();
	const views = store[integrationKey] ?? [];
	store[integrationKey] = views.filter((v) => v.id !== viewId);
	saveViewsStorage(store);
}

export function updateLocalViewConfig(
	integrationKey: string,
	viewId: string,
	config: ViewConfig,
): void {
	const store = getViewsStorage();
	const views = store[integrationKey] ?? [];
	store[integrationKey] = views.map((v) =>
		v.id === viewId ? { ...v, config: { ...v.config, ...config } } : v,
	);
	saveViewsStorage(store);
}

// ── Server-side view API ──────────────────────────────────────────────────────
interface ViewListResult {
	items: IntegrationView[];
}

export async function listViews(
	projectId: string,
	sprintId: string,
): Promise<IntegrationView[]> {
	const { data } = await apiClient.instance.get<SuccessEnvelope<ViewListResult>>(
		`/projects/${projectId}/sprints/${sprintId}/views`,
	);
	return data.data.items;
}

export async function apiCreateView(
	projectId: string,
	sprintId: string,
	payload: { name: string; view_type: ViewType; config?: ViewConfig },
): Promise<IntegrationView> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<IntegrationView>>(
		`/projects/${projectId}/sprints/${sprintId}/views`,
		payload,
	);
	return data.data;
}

export async function apiUpdateView(
	projectId: string,
	sprintId: string,
	viewId: string,
	payload: Partial<{ name: string; view_type: ViewType; config: ViewConfig }>,
): Promise<IntegrationView> {
	const { data } = await apiClient.instance.patch<SuccessEnvelope<IntegrationView>>(
		`/projects/${projectId}/sprints/${sprintId}/views/${viewId}`,
		payload,
	);
	return data.data;
}

export async function apiDeleteView(
	projectId: string,
	sprintId: string,
	viewId: string,
): Promise<void> {
	await apiClient.instance.delete(
		`/projects/${projectId}/sprints/${sprintId}/views/${viewId}`,
	);
}

export async function apiMoveTaskPosition(
	projectId: string,
	sprintId: string,
	viewId: string,
	payload: { task_id: string; position: number; group_key?: string },
): Promise<void> {
	await apiClient.instance.put(
		`/projects/${projectId}/sprints/${sprintId}/views/${viewId}/task-positions`,
		payload,
	);
}

// ── Sprint API ────────────────────────────────────────────────────────────────

export async function listSprints(projectId: string): Promise<Sprint[]> {
	const { data } = await apiClient.instance.get<
		SuccessEnvelope<SprintListResult>
	>(`/projects/${projectId}/sprints`);
	return data.data.items;
}

export async function getSprint(
	projectId: string,
	sprintId: string,
): Promise<Sprint> {
	const { data } = await apiClient.instance.get<SuccessEnvelope<Sprint>>(
		`/projects/${projectId}/sprints/${sprintId}`,
	);
	return data.data;
}

export interface CreateSprintPayload {
	name: string;
	status?: SprintStatus;
	goal?: string | null;
	start_date?: string | null;
	end_date?: string | null;
}

export async function createSprint(
	projectId: string,
	payload: CreateSprintPayload,
): Promise<Sprint> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<Sprint>>(
		`/projects/${projectId}/sprints`,
		payload,
	);
	return data.data;
}

// ── Task API ──────────────────────────────────────────────────────────────────

export interface ListTasksOptions {
	sprintId?: string;
	statusId?: string;
	assigneeId?: string;
	page?: number;
	pageSize?: number;
}

export async function listBacklogTasks(
	projectId: string,
	opts: ListTasksOptions = {},
): Promise<TaskListResult> {
	const params: Record<string, string | number> = {
		page: opts.page ?? 1,
		page_size: opts.pageSize ?? 200,
	};
	if (opts.statusId) params.status_id = opts.statusId;
	if (opts.assigneeId) params.assignee_id = opts.assigneeId;

	const { data } = await apiClient.instance.get<
		SuccessEnvelope<TaskListResult>
	>(`/projects/${projectId}/product-backlog`, { params });
	return data.data;
}

export async function listSprintTasks(
	projectId: string,
	sprintId: string,
	opts: ListTasksOptions = {},
): Promise<TaskListResult> {
	const params: Record<string, string | number> = {
		page: opts.page ?? 1,
		page_size: opts.pageSize ?? 200,
	};
	if (opts.statusId) params.status_id = opts.statusId;
	if (opts.assigneeId) params.assignee_id = opts.assigneeId;

	const { data } = await apiClient.instance.get<
		SuccessEnvelope<TaskListResult>
	>(`/projects/${projectId}/sprints/${sprintId}/tasks`, { params });
	return data.data;
}

export async function createTask(
	projectId: string,
	payload: {
		title: string;
		status_id?: string | null;
		sprint_id?: string | null;
		task_type_id?: string | null;
		assignee_id?: string | null;
	},
): Promise<Task> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<Task>>(
		`/projects/${projectId}/tasks`,
		payload,
	);
	return data.data;
}

export async function updateTask(
	projectId: string,
	taskId: string,
	payload: Partial<{
		title: string;
		status_id: string | null;
		sprint_id: string | null;
		task_type_id: string | null;
		assignee_id: string | null;
		board_position: number;
	}>,
): Promise<Task> {
	const { data } = await apiClient.instance.patch<SuccessEnvelope<Task>>(
		`/projects/${projectId}/tasks/${taskId}`,
		payload,
	);
	return data.data;
}

// ── Query Options ─────────────────────────────────────────────────────────────

export const sprintsQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: ["projects", projectId, "sprints"],
		queryFn: () => listSprints(projectId),
		staleTime: 30_000,
	});

export const sprintQueryOptions = (projectId: string, sprintId: string) =>
	queryOptions({
		queryKey: ["projects", projectId, "sprints", sprintId],
		queryFn: () => getSprint(projectId, sprintId),
		staleTime: 30_000,
	});

export const backlogTasksQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: ["projects", projectId, "backlog-tasks"],
		queryFn: () => listBacklogTasks(projectId),
		staleTime: 15_000,
	});

export const sprintTasksQueryOptions = (
	projectId: string,
	sprintId: string,
) =>
	queryOptions({
		queryKey: ["projects", projectId, "sprints", sprintId, "tasks"],
		queryFn: () => listSprintTasks(projectId, sprintId),
		staleTime: 15_000,
	});

export const viewsQueryOptions = (projectId: string, sprintId: string) =>
	queryOptions({
		queryKey: ["projects", projectId, "sprints", sprintId, "views"],
		queryFn: () => listViews(projectId, sprintId),
		staleTime: 30_000,
	});
