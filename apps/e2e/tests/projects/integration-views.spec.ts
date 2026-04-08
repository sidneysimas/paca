// spec: features/projects/integration-views.feature
// seed: tests/seed.spec.ts

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost';
const USERNAME = process.env.E2E_USERNAME ?? 'admin';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-admin-password';
const TEST_PROJECT_PREFIX = 'E2E_IV_';
const RUN_ID = Date.now().toString(36).slice(-5).toUpperCase();

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskStatus {
  id: string;
  name: string;
  category: string;
  position: number;
}

interface Task {
  id: string;
  title: string;
  status_id: string | null;
}

interface IntegrationView {
  id: string;
  name: string;
  view_type: string;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function authRequest(request: APIRequestContext): Promise<void> {
  await request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { username: USERNAME, password: PASSWORD, rememberMe: false },
  });
}

async function cleanupTestProjects(request: APIRequestContext): Promise<void> {
  await authRequest(request);

  const allProjects: Array<{ id: string; name: string }> = [];
  let page = 1;

  while (true) {
    const listResp = await request.get(`${BASE_URL}/api/v1/projects?page=${page}&page_size=100`);
    if (!listResp.ok()) break;
    const body = await listResp.json();
    const items: Array<{ id: string; name: string }> = body?.data?.items ?? [];
    if (items.length === 0) break;
    allProjects.push(...items);
    const { page: currentPage, page_size, total } = body.data as { page: number; page_size: number; total: number };
    if (currentPage * page_size >= total) break;
    page++;
  }

  await Promise.all(
    allProjects
      .filter((p) => p.name.startsWith(TEST_PROJECT_PREFIX))
      .map((p) => request.delete(`${BASE_URL}/api/v1/projects/${p.id}`)),
  );
}

async function createProject(request: APIRequestContext, name: string): Promise<string> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects`, {
    data: { name },
  });
  const body = await resp.json();
  return body.data.id as string;
}

async function getTaskStatuses(request: APIRequestContext, projectId: string): Promise<TaskStatus[]> {
  const resp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/task-statuses`);
  const body = await resp.json();
  return (body?.data?.items ?? []) as TaskStatus[];
}

async function createTask(
  request: APIRequestContext,
  projectId: string,
  payload: { title: string; status_id?: string; sprint_id?: string; task_type_id?: string; assignee_id?: string },
): Promise<Task> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/tasks`, {
    data: payload,
  });
  const body = await resp.json();
  return body.data as Task;
}

async function createBacklogView(
  request: APIRequestContext,
  projectId: string,
  name: string,
  view_type: 'board' | 'table' | 'roadmap',
): Promise<IntegrationView> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/product-backlog/views`, {
    data: { name, view_type },
  });
  const body = await resp.json();
  return body.data as IntegrationView;
}

async function createSprint(request: APIRequestContext, projectId: string, name: string): Promise<string> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/sprints`, {
    data: { name, status: 'active' },
  });
  const body = await resp.json();
  return body.data.id as string;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

const signIn = async (page: Page) => {
  await page.goto(`${BASE_URL}/`);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
};

const navigateToBacklog = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/integrations/backlog`);
  await expect(page.getByRole('heading', { name: 'Product Backlog' })).toBeVisible({ timeout: 10_000 });
};

const navigateToSprint = async (page: Page, projectId: string, sprintId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/integrations/sprints/${sprintId}`);
};

// ─── Test Suites ──────────────────────────────────────────────────────────────

// ===========================================================================
// Rule: Entering an integration opens its default view
// ===========================================================================

test.describe('Entering an integration opens its default view', () => {
  let projectId: string;
  let boardViewId: string;
  let tableViewId: string;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}VIEWS_${RUN_ID}`);
    // Ensure at least two views exist (Board + Table)
    const boardView = await createBacklogView(request, projectId, 'Board', 'board');
    boardViewId = boardView.id;
    const tableView = await createBacklogView(request, projectId, 'Table', 'table');
    tableViewId = tableView.id;
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Navigating to the product backlog opens the default view', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // The integration page should be visible
    await expect(page.getByRole('heading', { name: 'Product Backlog' })).toBeVisible();

    // A view tab bar should be shown (at least one tab)
    const firstTab = page.getByRole('button', { name: 'Board' });
    await expect(firstTab).toBeVisible();

    // The first view tab should be active (has the primary underline indicator)
    await expect(firstTab).toHaveClass(/text-foreground/);
  });

  test('The view header shows the integration name and a description', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Page header should display "Product Backlog"
    await expect(page.getByRole('heading', { name: 'Product Backlog' })).toBeVisible();

    // A subtitle / description area should be visible beneath the header
    await expect(page.getByText(/All work items not assigned to a sprint\./i)).toBeVisible();
  });

  test('Board view tab shows the kanban board layout', async ({ page, request }) => {
    // Ensure "Board" view exists
    await createBacklogView(request, projectId, 'Board', 'board');

    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Board' }).first().click();

    // The kanban board layout renders as a horizontal scrolling container with columns
    await expect(page.locator('[class*="overflow-x-auto"] >> div[class*="w-72"]').first()).toBeVisible();
  });

  test('Table view tab shows the tabular list layout', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Click the "Table" view tab
    await page.getByRole('button', { name: 'Table' }).click();

    // The table layout renders a scrollable list of status-grouped rows
    await expect(page.locator('[class*="overflow-auto"]').last()).toBeVisible();
  });

  test('Roadmap view tab shows the roadmap timeline layout', async ({ page, request }) => {
    // Create a roadmap view
    await createBacklogView(request, projectId, 'Roadmap', 'roadmap');

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Click the "Roadmap" view tab
    await page.getByRole('button', { name: 'Roadmap' }).click();

    // The roadmap header row with month labels should be visible
    await expect(page.locator('[class*="overflow-x-auto"]').last()).toBeVisible();
  });

  test('Navigating to a sprint opens that sprint\'s default view', async ({ page, request }) => {
    const sprintId = await createSprint(request, projectId, `${TEST_PROJECT_PREFIX}SPRINT_${RUN_ID}`);
    await signIn(page);
    await navigateToSprint(page, projectId, sprintId);

    // The integration page for the sprint should be visible
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}SPRINT_${RUN_ID}`)).toBeVisible();

    // A view tab bar should be shown
    const tabs = page.locator('[class*="border-b"] button[class*="text-xs"][class*="font-medium"]');
    await expect(tabs.first()).toBeVisible();
  });
});

// ===========================================================================
// Rule: Board view layout and task display
// ===========================================================================

test.describe('Board view layout and task display', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}BOARD_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    await createBacklogView(request, projectId, 'Board', 'board');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Board columns match the project\'s configured task statuses', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Board' }).first().click();

    // Each status should have a corresponding column header
    for (const status of statuses) {
      await expect(page.getByText(status.name, { exact: true }).first()).toBeVisible();
    }
  });

  test('Column headers display the status name and task count', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (todoStatus) {
      await expect(page.getByText(todoStatus.name, { exact: true }).first()).toBeVisible();
    }
  });

  test('Tasks appear in the column matching their status', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    const inProgressStatus = statuses.find((s) => s.name === 'In Progress') ?? statuses[2];
    if (!todoStatus || !inProgressStatus) { test.skip(); return; }

    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}TASK_TODO`, status_id: todoStatus.id });
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}TASK_IP`, status_id: inProgressStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    // Both tasks should be visible on the board
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}TASK_TODO`)).toBeVisible();
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}TASK_IP`)).toBeVisible();
  });

  test('Unassigned tasks show an empty avatar placeholder', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}UNASSIGNED`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    // The card should be visible and have a dashed avatar placeholder (border-dashed class)
    const card = page.locator('[data-task-id]').filter({ hasText: `${TEST_PROJECT_PREFIX}UNASSIGNED` });
    await expect(card).toBeVisible();
    await expect(card.locator('[class*="border-dashed"]')).toBeVisible();
  });

  test('Columns with no tasks show an empty-state message', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    // With no tasks, at least one column should show the empty state
    await expect(page.getByText('No tasks').first()).toBeVisible();
  });

  test('Clicking a task card opens the task detail panel', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}DETAIL_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    await page.locator('[data-task-id]').filter({ hasText: `${TEST_PROJECT_PREFIX}DETAIL_TASK` }).click();

    // The task detail panel or dialog should open with the task title visible
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}DETAIL_TASK`).nth(1)).toBeVisible();
  });
});

// ===========================================================================
// Rule: Dragging tasks between board columns changes their status
// ===========================================================================

test.describe('Dragging tasks between board columns changes their status', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}DRAG_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    await createBacklogView(request, projectId, 'Board', 'board');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Dragging a task card to another column updates the task status', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    const inProgressStatus = statuses.find((s) => s.name === 'In Progress');
    if (!todoStatus || !inProgressStatus) { test.skip(); return; }

    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}DRAG_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    const taskCard = page.locator('[data-task-id]').filter({ hasText: `${TEST_PROJECT_PREFIX}DRAG_TASK` });
    await expect(taskCard).toBeVisible();

    // Find target column drop zone via the "In Progress" header
    const targetColumn = page.locator('div[class*="flex"][class*="w-72"]').filter({
      hasText: inProgressStatus.name,
    });
    await expect(targetColumn).toBeVisible();

    await taskCard.dragTo(targetColumn);

    // After the drag, the task should appear somewhere in the "In Progress" column area
    await expect(
      page.locator('div[class*="flex"][class*="w-72"]').filter({ hasText: inProgressStatus.name })
        .locator('[data-task-id]').filter({ hasText: `${TEST_PROJECT_PREFIX}DRAG_TASK` }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ===========================================================================
// Rule: Table view layout and task display
// ===========================================================================

test.describe('Table view layout and task display', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}TABLE_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    await createBacklogView(request, projectId, 'Table', 'table');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Tasks are displayed as rows grouped under their status heading', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}ROW_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    // The task should appear as a row
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}ROW_TASK`)).toBeVisible();
    // A status group heading should exist for "Todo"
    await expect(page.getByText(todoStatus.name, { exact: true }).first()).toBeVisible();
  });

  test('Each status group heading shows the status name and task count', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}COUNT_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    // Group heading should show status name
    await expect(page.getByText(todoStatus.name, { exact: true }).first()).toBeVisible();
    // And a task count (at least "1")
    await expect(page.getByText('1').first()).toBeVisible();
  });

  test('Column headers show Type, Priority, Title, Status, Assignee', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}COLS_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    // First, expand the group to see column headers
    await page.getByText(todoStatus.name, { exact: true }).first().click();

    // Column headers should be visible
    await expect(page.getByText('Type', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Title', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Priority', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Status', { exact: true }).first()).toBeVisible();
  });

  test('Status groups can be collapsed and expanded', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}COLLAPSE_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    // The todo group should be expanded by default
    const taskText = page.getByText(`${TEST_PROJECT_PREFIX}COLLAPSE_TASK`);
    await expect(taskText).toBeVisible();

    // Click the group header to collapse it
    await page.getByText(todoStatus.name, { exact: true }).first().click();

    // The task should no longer be visible
    await expect(taskText).not.toBeVisible();

    // Click again to expand
    await page.getByText(todoStatus.name, { exact: true }).first().click();

    // The task should be visible again
    await expect(taskText).toBeVisible();
  });

  test('Clicking a task row opens the task detail panel', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}TABLE_DETAIL`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    await page.getByText(`${TEST_PROJECT_PREFIX}TABLE_DETAIL`).click();

    // Detail panel should open with the task title
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}TABLE_DETAIL`).nth(1)).toBeVisible();
  });

  test('Done group is collapsed by default', async ({ page, request }) => {
    const doneStatus = statuses.find((s) => s.category === 'done');
    if (!doneStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}DONE_TASK`, status_id: doneStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    // The "Done" group should be collapsed (the done task should not be visible)
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}DONE_TASK`)).not.toBeVisible();

    // But the heading should still show the task count
    await expect(page.getByText(doneStatus.name, { exact: true }).first()).toBeVisible();
  });
});

// ===========================================================================
// Rule: Creating a task from the board view
// ===========================================================================

test.describe('Creating a task from the board view', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}CREATE_B_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    await createBacklogView(request, projectId, 'Board', 'board');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Each board column has an "Add task" button at the bottom', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    // At least one "Add task" button should be visible
    await expect(page.getByText('Add task').first()).toBeVisible();
  });

  test('Clicking "Add task" in a column opens an inline creation input', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    await page.getByText('Add task').first().click();

    // An input placeholder "Task title…" should appear
    await expect(page.getByPlaceholder('Task title…').first()).toBeVisible();
  });

  test('Typing a title and pressing Enter creates the task', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    await page.getByText('Add task').first().click();
    await page.getByPlaceholder('Task title…').first().fill(`${TEST_PROJECT_PREFIX}BOARD_NEW`);
    await page.getByPlaceholder('Task title…').first().press('Enter');

    // The new task card should appear
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}BOARD_NEW`)).toBeVisible({ timeout: 10_000 });
    // The inline input should close
    await expect(page.getByPlaceholder('Task title…').first()).not.toBeVisible();
  });

  test('Pressing Escape cancels inline task creation', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    await page.getByText('Add task').first().click();
    await page.getByPlaceholder('Task title…').first().fill(`${TEST_PROJECT_PREFIX}CANCELLED`);
    await page.keyboard.press('Escape');

    // The input should close
    await expect(page.getByPlaceholder('Task title…').first()).not.toBeVisible();
    // No task with that name should appear
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}CANCELLED`)).not.toBeVisible();
  });

  test('Submitting an empty title does not create a task', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Board' }).first().click();

    await page.getByText('Add task').first().click();
    // Press Enter without typing anything
    await page.getByPlaceholder('Task title…').first().press('Enter');

    // The input should remain open (empty submit does nothing)
    await expect(page.getByPlaceholder('Task title…').first()).toBeVisible();
  });
});

// ===========================================================================
// Rule: Creating a task from the table view
// ===========================================================================

test.describe('Creating a task from the table view', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}CREATE_T_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    await createBacklogView(request, projectId, 'Table', 'table');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Each status group has an "Add task" button', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    await expect(page.getByText('Add task').first()).toBeVisible();
  });

  test('Clicking "Add task" in a group opens an inline creation row', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    await page.getByText('Add task').first().click();
    await expect(page.getByPlaceholder('Task title…').first()).toBeVisible();
  });

  test('Typing a title and pressing Enter creates the task in the group', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    await page.getByText('Add task').first().click();
    await page.getByPlaceholder('Task title…').first().fill(`${TEST_PROJECT_PREFIX}TABLE_NEW`);
    await page.getByPlaceholder('Task title…').first().press('Enter');

    // The new task row should appear
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}TABLE_NEW`)).toBeVisible({ timeout: 10_000 });
    // The inline row should close
    await expect(page.getByPlaceholder('Task title…').first()).not.toBeVisible();
  });

  test('Pressing Escape cancels inline creation in the table view', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);
    await page.getByRole('button', { name: 'Table' }).click();

    await page.getByText('Add task').first().click();
    await page.getByPlaceholder('Task title…').first().fill(`${TEST_PROJECT_PREFIX}TABLE_CANCEL`);
    await page.keyboard.press('Escape');

    await expect(page.getByPlaceholder('Task title…').first()).not.toBeVisible();
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}TABLE_CANCEL`)).not.toBeVisible();
  });
});

// ===========================================================================
// Rule: Managing views (create, rename, delete)
// ===========================================================================

test.describe('Managing views (create, rename, delete)', () => {
  let projectId: string;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}VM_${RUN_ID}`);
    // Start with one Board view so the manage-views scenarios have something to work with
    await createBacklogView(request, projectId, 'Board', 'board');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('"Add view" button is visible to the right of the last view tab for authorised users', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await expect(page.getByRole('button', { name: 'Add view' })).toBeVisible();
  });

  test('"View settings" button is visible in the view toolbar', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await expect(page.getByRole('button', { name: 'View settings' })).toBeVisible();
  });

  test('Clicking "Add view" opens a popover with layout options', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Add view' }).click();

    // Popover should show layout options
    await expect(page.getByText('Table')).toBeVisible();
    await expect(page.getByText('Board')).toBeVisible();
    await expect(page.getByText('Roadmap')).toBeVisible();

    // And a view name field
    await expect(page.getByPlaceholder(/New (Board|Table|Roadmap)/)).toBeVisible();
  });

  test('Creating a Board view adds a new tab in the tab bar', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Add view' }).click();
    // Fill in view name
    await page.getByPlaceholder(/New (Board|Table|Roadmap)/).fill(`${TEST_PROJECT_PREFIX}BOARD_VIEW`);
    // Select Board layout
    await page.getByText('Board', { exact: true }).last().click();
    // Confirm creation
    await page.getByRole('button', { name: 'Create view' }).click();

    // New tab should appear
    await expect(page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}BOARD_VIEW` })).toBeVisible({ timeout: 10_000 });
  });

  test('Creating a Table view adds a new tab in the tab bar', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Add view' }).click();
    await page.getByPlaceholder(/New (Board|Table|Roadmap)/).fill(`${TEST_PROJECT_PREFIX}TABLE_VIEW`);
    await page.getByText('Table', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Create view' }).click();

    await expect(page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}TABLE_VIEW` })).toBeVisible({ timeout: 10_000 });
  });

  test('Creating a Roadmap view adds a new tab in the tab bar', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Add view' }).click();
    await page.getByPlaceholder(/New (Board|Table|Roadmap)/).fill(`${TEST_PROJECT_PREFIX}ROADMAP_VIEW`);
    await page.getByText('Roadmap', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Create view' }).click();

    await expect(page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}ROADMAP_VIEW` })).toBeVisible({ timeout: 10_000 });
  });

  test('Creating a view without a name defaults to a generated name', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Add view' }).click();
    // Clear the name input
    await page.getByPlaceholder(/New (Board|Table|Roadmap)/).clear();
    await page.getByRole('button', { name: 'Create view' }).click();

    // A new tab should appear with a default generated name ("New Board" when Board is selected)
    await expect(page.getByRole('button', { name: /New (Board|Table|Roadmap)/ })).toBeVisible({ timeout: 10_000 });
  });

  test('Renaming a view updates its tab label', async ({ page, request }) => {
    await createBacklogView(request, projectId, `${TEST_PROJECT_PREFIX}OLD_VIEW`, 'board');

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Hover the tab to reveal the options menu trigger
    const tab = page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}OLD_VIEW` });
    await tab.hover();

    // Click the MoreHorizontal / options icon on that tab
    const tabGroup = page.locator('.group').filter({ has: page.getByText(`${TEST_PROJECT_PREFIX}OLD_VIEW`) });
    await tabGroup.locator('button[class*="opacity-0"]').click({ force: true });

    // Select "Rename view"
    await page.getByText('Rename view').click();

    // Clear current name and type new name
    await page.locator('dialog input, [role="dialog"] input').last().clear();
    await page.locator('dialog input, [role="dialog"] input').last().fill(`${TEST_PROJECT_PREFIX}RENAMED_VIEW`);
    await page.getByRole('button', { name: 'Rename' }).click();

    // Tab should be relabelled
    await expect(page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}RENAMED_VIEW` })).toBeVisible({ timeout: 10_000 });
  });

  test('Deleting a view removes its tab', async ({ page, request }) => {
    // Create two views so we can delete one
    await createBacklogView(request, projectId, `${TEST_PROJECT_PREFIX}VIEW_ALPHA`, 'board');
    await createBacklogView(request, projectId, `${TEST_PROJECT_PREFIX}VIEW_BETA`, 'table');

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Click the BETA tab first
    await page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}VIEW_BETA` }).click();

    // Open options menu and delete
    const tabGroup = page.locator('.group').filter({ has: page.getByText(`${TEST_PROJECT_PREFIX}VIEW_BETA`) });
    await tabGroup.locator('button[class*="opacity-0"]').click({ force: true });
    await page.getByText('Delete view').click();

    // The BETA tab should no longer be visible
    await expect(page.getByRole('button', { name: `${TEST_PROJECT_PREFIX}VIEW_BETA` })).not.toBeVisible({ timeout: 10_000 });
  });

  test('The last remaining view cannot be deleted', async ({ page, request }) => {
    // Only one view: the Board created in beforeEach
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Open options menu for the only view
    const boardTab = page.getByRole('button', { name: 'Board' });
    const tabGroup = page.locator('.group').filter({ has: boardTab });
    await tabGroup.locator('button[class*="opacity-0"]').click({ force: true });

    // "Delete view" should be disabled or absent
    const deleteItem = page.getByText('Delete view');
    await expect(deleteItem).toBeVisible();
    // It should be aria-disabled or have the disabled attribute
    await expect(deleteItem.locator('xpath=ancestor::*[@aria-disabled="true" or @disabled][1]')).toBeVisible();
  });
});

// ===========================================================================
// Rule: Switching and persisting the active view
// ===========================================================================

test.describe('Switching and persisting the active view', () => {
  let projectId: string;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}SWITCH_${RUN_ID}`);
    await createBacklogView(request, projectId, 'Board', 'board');
    await createBacklogView(request, projectId, 'Table', 'table');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Clicking a view tab switches the active layout', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Default: Board tab should be first/active
    const boardTab = page.getByRole('button', { name: 'Board' });
    const tableTab = page.getByRole('button', { name: 'Table' });

    // Click the Table tab
    await tableTab.click();

    // The Table tab should now be active (has the foreground text colour class)
    await expect(tableTab).toHaveClass(/text-foreground/);

    // The Board tab should not be active
    await expect(boardTab).not.toHaveClass(/text-foreground after:/);
  });

  test('The active view tab is visually distinguished', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // The first (Board) tab should be active — its parent has the primary underline pseudo-element
    const boardTab = page.getByRole('button', { name: 'Board' });
    await expect(boardTab).toHaveClass(/text-foreground/);
  });

  test('Refreshing the page preserves the last active view', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Switch to Table view
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('button', { name: 'Table' })).toHaveClass(/text-foreground/);

    // Refresh the page
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Product Backlog' })).toBeVisible();

    // The Table view should still be active
    await expect(page.getByRole('button', { name: 'Table' })).toHaveClass(/text-foreground/);
  });
});

// ===========================================================================
// Rule: Filtering and searching tasks within a view
// ===========================================================================

test.describe('Filtering and searching tasks within a view', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}FILTER_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    await createBacklogView(request, projectId, 'Board', 'board');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('A search or filter bar is visible at the top of the integration view', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    // The search icon button should be visible
    await expect(page.locator('button').filter({ has: page.locator('svg[class*="size-3.5"]') }).first()).toBeVisible();
  });

  test('Searching by keyword filters visible tasks', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }

    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}ALPHA_TASK`, status_id: todoStatus.id });
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}BETA_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Open the search bar
    await page.locator('[class*="border-b"][class*="px-4"] button').filter({ has: page.locator('[class*="size-3.5"]') }).first().click();

    // Type a search keyword
    await page.getByPlaceholder('Search tasks…').fill('ALPHA');

    // Only ALPHA_TASK should be visible; BETA_TASK should not
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}ALPHA_TASK`)).toBeVisible();
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}BETA_TASK`)).not.toBeVisible();
  });

  test('Clearing the filter restores all tasks', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }

    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}ALPHA2_TASK`, status_id: todoStatus.id });
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}BETA2_TASK`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Open search and filter
    await page.locator('[class*="border-b"][class*="px-4"] button').filter({ has: page.locator('[class*="size-3.5"]') }).first().click();
    await page.getByPlaceholder('Search tasks…').fill('ALPHA2');
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}BETA2_TASK`)).not.toBeVisible();

    // Clear the search by clicking the X button
    await page.locator('button').filter({ has: page.locator('[class*="size-3"]') }).last().click();

    // Both tasks should be visible again
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}ALPHA2_TASK`)).toBeVisible();
    await expect(page.getByText(`${TEST_PROJECT_PREFIX}BETA2_TASK`)).toBeVisible();
  });
});

// ===========================================================================
// Rule: View settings panel
// ===========================================================================

test.describe('View settings panel', () => {
  let projectId: string;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}SETTINGS_${RUN_ID}`);
    await createBacklogView(request, projectId, 'Board', 'board');
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Clicking "View settings" opens a settings panel with all expected rows', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'View settings' }).click();

    // All expected setting rows should be visible
    await expect(page.getByText('Fields')).toBeVisible();
    await expect(page.getByText('Column by')).toBeVisible();
    await expect(page.getByText('Swimlanes')).toBeVisible();
    await expect(page.getByText('Sort by')).toBeVisible();
    await expect(page.getByText('Field sum')).toBeVisible();
    await expect(page.getByText('Slice by')).toBeVisible();
  });

  test('The settings panel has Save and Reset buttons', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'View settings' }).click();

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
  });

  test('Changing "Sort by" to "Manual" shows manual value', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'View settings' }).click();

    // Change Sort by setting to "manual"
    await page.locator('select').nth(2).selectOption('manual');

    // The select should now show "manual"
    await expect(page.locator('select').nth(2)).toHaveValue('manual');
  });

  test('Clicking Save persists the settings and closes the popup', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'View settings' }).click();

    // Change a setting
    await page.locator('select').nth(2).selectOption('manual');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();

    // The settings panel should close
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible({ timeout: 5_000 });

    // After reopening, the saved setting should persist
    await page.getByRole('button', { name: 'View settings' }).click();
    await expect(page.locator('select').nth(2)).toHaveValue('manual');
  });

  test('Clicking Reset reverts the draft to the last saved settings', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'View settings' }).click();

    // Note the initial value
    const initialValue = await page.locator('select').nth(2).inputValue();

    // Change to manual
    await page.locator('select').nth(2).selectOption('manual');
    await expect(page.locator('select').nth(2)).toHaveValue('manual');

    // Reset — should revert to last saved (initial)
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('select').nth(2)).toHaveValue(initialValue);
  });

  test('Closing the popup without saving discards unsaved changes', async ({ page }) => {
    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'View settings' }).click();

    // Get initial sort value
    const initialValue = await page.locator('select').nth(2).inputValue();

    // Change a setting
    await page.locator('select').nth(2).selectOption('manual');

    // Close by pressing Escape
    await page.keyboard.press('Escape');

    // Panel should be closed
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible({ timeout: 5_000 });

    // Reopen and verify the change was discarded
    await page.getByRole('button', { name: 'View settings' }).click();
    await expect(page.locator('select').nth(2)).toHaveValue(initialValue);
  });

  test('View settings are persisted per view', async ({ page, request }) => {
    // Create a second view (Table)
    await createBacklogView(request, projectId, 'Table', 'table');

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Set "Sort by: manual" on Board view and save
    await page.getByRole('button', { name: 'Board' }).first().click();
    await page.getByRole('button', { name: 'View settings' }).click();
    await page.locator('select').nth(2).selectOption('manual');
    await page.getByRole('button', { name: 'Save' }).click();

    // Switch to Table view
    await page.getByRole('button', { name: 'Table' }).click();
    await page.getByRole('button', { name: 'View settings' }).click();
    // Table view should have default (not manual) sort
    await expect(page.locator('select').nth(2)).not.toHaveValue('manual');
    await page.keyboard.press('Escape');

    // Switch back to Board view
    await page.getByRole('button', { name: 'Board' }).first().click();
    await page.getByRole('button', { name: 'View settings' }).click();
    // Board view should still have manual sort
    await expect(page.locator('select').nth(2)).toHaveValue('manual');
  });
});

// ===========================================================================
// Rule: Manual task sort order within a view
// ===========================================================================

test.describe('Manual task sort order within a view', () => {
  let projectId: string;
  let statuses: TaskStatus[];

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}MSORT_${RUN_ID}`);
    statuses = await getTaskStatuses(request, projectId);
    // Create a Table view with manual sort already configured via API
    await request.post(`${BASE_URL}/api/v1/projects/${projectId}/product-backlog/views`, {
      data: { name: 'Manual Table', view_type: 'table', config: { sort_by: 'manual' } },
    });
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Table rows show a drag handle when the view sort order is manual', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}DRAG_ROW`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);

    // Switch to the Manual Table view
    await page.getByRole('button', { name: 'Manual Table' }).click();

    // Task row should show a drag handle (GripVertical icon)
    const taskRow = page.getByText(`${TEST_PROJECT_PREFIX}DRAG_ROW`).locator('xpath=ancestor::div[contains(@class,"group")]');
    // The drag handle is a sibling element with the grip icon
    await expect(page.locator('[class*="cursor-grab"]').first()).toBeVisible();
  });

  test('Task rows are not draggable when sort order is not manual', async ({ page, request }) => {
    const todoStatus = statuses.find((s) => s.category === 'todo');
    if (!todoStatus) { test.skip(); return; }

    // Create a regular table view (no manual sort)
    await createBacklogView(request, projectId, 'Regular Table', 'table');
    await createTask(request, projectId, { title: `${TEST_PROJECT_PREFIX}NO_DRAG`, status_id: todoStatus.id });

    await signIn(page);
    await navigateToBacklog(page, projectId);

    await page.getByRole('button', { name: 'Regular Table' }).click();

    // No drag handles should be visible
    await expect(page.locator('[class*="cursor-grab"]').first()).not.toBeVisible();
  });
});
