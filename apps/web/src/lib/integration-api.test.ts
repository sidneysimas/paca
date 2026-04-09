import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
	mockGet: vi.fn(),
	mockPost: vi.fn(),
	mockPatch: vi.fn(),
	mockDelete: vi.fn(),
}));

vi.mock("./api-client", () => ({
	apiClient: {
		instance: {
			get: mockGet,
			post: mockPost,
			patch: mockPatch,
			delete: mockDelete,
		},
	},
}));

import {
	createTask,
	getTask,
	layoutToViewType,
	listBacklogTasks,
	listSprintTasks,
	type Task,
	updateTask,
} from "./integration-api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECT_ID = "proj-1";
const TASK_ID = "task-1";
const SPRINT_ID = "sprint-1";
const STATUS_ID = "status-2";

const makeTask = (overrides: Partial<Task> = {}): Task => ({
	id: TASK_ID,
	project_id: PROJECT_ID,
	title: "Test Task",
	sprint_id: SPRINT_ID,
	status_id: null,
	task_type_id: null,
	parent_task_id: null,
	description: null,
	importance: 0,
	assignee_id: null,
	reporter_id: null,
	custom_fields: {},
	view_position: null,
	view_group_key: null,
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
	...overrides,
});

function ok<T>(data: T) {
	return { data: { data, success: true } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("integration-api", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── getTask ───────────────────────────────────────────────────────────────

	describe("getTask", () => {
		it("fetches the task by id and unwraps it", async () => {
			const task = makeTask();
			mockGet.mockResolvedValue(ok(task));

			await expect(getTask(PROJECT_ID, TASK_ID)).resolves.toEqual(task);
			expect(mockGet).toHaveBeenCalledWith(
				`/projects/${PROJECT_ID}/tasks/${TASK_ID}`,
			);
		});
	});

	// ── createTask ────────────────────────────────────────────────────────────

	describe("createTask", () => {
		it("posts the payload and returns the created task", async () => {
			const task = makeTask({ title: "New Task" });
			mockPost.mockResolvedValue(ok(task));

			const result = await createTask(PROJECT_ID, { title: "New Task" });
			expect(result).toEqual(task);
			expect(mockPost).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/tasks`, {
				title: "New Task",
			});
		});

		it("includes sprint_id and status_id when provided", async () => {
			mockPost.mockResolvedValue(ok(makeTask()));

			await createTask(PROJECT_ID, {
				title: "Sprint Task",
				sprint_id: SPRINT_ID,
				status_id: STATUS_ID,
			});

			expect(mockPost).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/tasks`, {
				title: "Sprint Task",
				sprint_id: SPRINT_ID,
				status_id: STATUS_ID,
			});
		});
	});

	// ── updateTask ────────────────────────────────────────────────────────────

	describe("updateTask", () => {
		it("sends only the provided fields — status_id only should not include sprint_id", async () => {
			const updated = makeTask({ status_id: STATUS_ID });
			mockPatch.mockResolvedValue(ok(updated));

			const result = await updateTask(PROJECT_ID, TASK_ID, {
				status_id: STATUS_ID,
			});
			expect(result).toEqual(updated);

			const patchedPayload = mockPatch.mock.calls[0][1] as Record<
				string,
				unknown
			>;
			// The payload must contain the status_id we sent
			expect(patchedPayload).toMatchObject({ status_id: STATUS_ID });
		});

		it("sends sprint_id when explicitly provided alongside status_id", async () => {
			const updated = makeTask({ status_id: STATUS_ID, sprint_id: SPRINT_ID });
			mockPatch.mockResolvedValue(ok(updated));

			await updateTask(PROJECT_ID, TASK_ID, {
				status_id: STATUS_ID,
				sprint_id: SPRINT_ID,
			});

			const patchedPayload = mockPatch.mock.calls[0][1] as Record<
				string,
				unknown
			>;
			expect(patchedPayload).toMatchObject({
				status_id: STATUS_ID,
				sprint_id: SPRINT_ID,
			});
		});

		it("allows explicitly setting sprint_id to null to move task to backlog", async () => {
			const updated = makeTask({ sprint_id: null });
			mockPatch.mockResolvedValue(ok(updated));

			await updateTask(PROJECT_ID, TASK_ID, { sprint_id: null });

			const patchedPayload = mockPatch.mock.calls[0][1] as Record<
				string,
				unknown
			>;
			expect(patchedPayload).toMatchObject({ sprint_id: null });
		});

		it("calls the correct API path", async () => {
			mockPatch.mockResolvedValue(ok(makeTask()));
			await updateTask(PROJECT_ID, TASK_ID, { status_id: STATUS_ID });
			expect(mockPatch).toHaveBeenCalledWith(
				`/projects/${PROJECT_ID}/tasks/${TASK_ID}`,
				expect.any(Object),
			);
		});
	});

	// ── listSprintTasks ───────────────────────────────────────────────────────

	describe("listSprintTasks", () => {
		it("fetches tasks for a sprint and returns TaskListResult", async () => {
			const task = makeTask();
			mockGet.mockResolvedValue(
				ok({ items: [task], total: 1, page: 1, page_size: 200 }),
			);

			const result = await listSprintTasks(PROJECT_ID, SPRINT_ID);
			expect(result).toEqual({
				items: [task],
				total: 1,
				page: 1,
				page_size: 200,
			});
			expect(mockGet).toHaveBeenCalledWith(
				expect.stringContaining(
					`/projects/${PROJECT_ID}/sprints/${SPRINT_ID}/tasks`,
				),
				expect.any(Object),
			);
		});

		it("appends view_id param when provided", async () => {
			mockGet.mockResolvedValue(
				ok({ items: [], total: 0, page: 1, page_size: 200 }),
			);

			await listSprintTasks(PROJECT_ID, SPRINT_ID, { viewId: "view-99" });

			const [, config] = mockGet.mock.calls[0] as [
				string,
				{ params: Record<string, unknown> },
			];
			expect(config.params?.view_id).toBe("view-99");
		});
	});

	// ── listBacklogTasks ──────────────────────────────────────────────────────

	describe("listBacklogTasks", () => {
		it("fetches backlog tasks (no sprint filter) and returns TaskListResult", async () => {
			const task = makeTask({ sprint_id: null });
			mockGet.mockResolvedValue(
				ok({ items: [task], total: 1, page: 1, page_size: 200 }),
			);

			const result = await listBacklogTasks(PROJECT_ID);
			expect(result).toEqual({
				items: [task],
				total: 1,
				page: 1,
				page_size: 200,
			});
		});
	});

	// ── layoutToViewType ─────────────────────────────────────────────────────

	describe("layoutToViewType", () => {
		it("maps Board → board", () => {
			expect(layoutToViewType("Board")).toBe("board");
		});
		it("maps Table → table", () => {
			expect(layoutToViewType("Table")).toBe("table");
		});
		it("maps Roadmap → roadmap", () => {
			expect(layoutToViewType("Roadmap")).toBe("roadmap");
		});
	});
});
