// spec: features/projects/bdd-scenarios.feature
// seed: tests/seed.spec.ts

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost';
const USERNAME = process.env.E2E_USERNAME ?? 'admin';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-admin-password';
const TEST_PROJECT_PREFIX = 'E2E_BDD_';
const RUN_ID = Date.now().toString(36).slice(-5).toUpperCase();

// ─── API types ────────────────────────────────────────────────────────────────

interface TaskStatus {
  id: string;
  category: string;
}

interface TaskType {
  id: string;
  name: string;
  is_system: boolean;
}

interface Task {
  id: string;
  title: string;
}

interface BDDScenario {
  id: string;
  title: string;
  given: string;
  when: string;
  then: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function authRequest(request: APIRequestContext): Promise<void> {
  await request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { username: USERNAME, password: PASSWORD, rememberMe: false },
  });
}

async function cleanupTestProjects(request: APIRequestContext): Promise<void> {
  await authRequest(request);
  let page = 1;
  while (true) {
    const resp = await request.get(`${BASE_URL}/api/v1/projects?page=${page}&page_size=100`);
    if (!resp.ok()) break;
    const body = await resp.json();
    const items: Array<{ id: string; name: string }> = body?.data?.items ?? [];
    if (items.length === 0) break;
    await Promise.all(
      items
        .filter((p) => p.name.startsWith(TEST_PROJECT_PREFIX))
        .map((p) => request.delete(`${BASE_URL}/api/v1/projects/${p.id}`)),
    );
    const { page: cur, page_size, total } = body.data;
    if (cur * page_size >= total) break;
    page++;
  }
}

async function createProject(request: APIRequestContext, name: string): Promise<string> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects`, { data: { name } });
  return (await resp.json()).data.id as string;
}

async function getTaskStatuses(request: APIRequestContext, projectId: string): Promise<TaskStatus[]> {
  const resp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/task-statuses`);
  return ((await resp.json())?.data?.items ?? []) as TaskStatus[];
}

async function getTaskTypes(request: APIRequestContext, projectId: string): Promise<TaskType[]> {
  const resp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/task-types`);
  return ((await resp.json())?.data?.items ?? []) as TaskType[];
}

async function createTask(
  request: APIRequestContext,
  projectId: string,
  title: string,
  statusId?: string,
  taskTypeId?: string,
): Promise<Task> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/tasks`, {
    data: { title, status_id: statusId ?? null, task_type_id: taskTypeId ?? null },
  });
  return (await resp.json()).data as Task;
}

async function createBDDScenario(
  request: APIRequestContext,
  projectId: string,
  taskId: string,
  payload: { title: string; given?: string; when?: string; then?: string },
): Promise<BDDScenario> {
  const resp = await request.post(
    `${BASE_URL}/api/v1/projects/${projectId}/tasks/${taskId}/bdd-scenarios`,
    {
      data: {
        title: payload.title,
        given: payload.given ?? '',
        when: payload.when ?? '',
        then: payload.then ?? '',
      },
    },
  );
  return (await resp.json()).data as BDDScenario;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/`);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
}

async function openTaskDetail(page: Page, projectId: string, taskId: string): Promise<void> {
  await page.goto(`${BASE_URL}/projects/${projectId}/interactions/backlog?taskId=${taskId}`);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// =============================================================================
// Rule: CRUD operations on BDD scenarios — Empty state
// =============================================================================

test.describe('BDD Scenarios — empty state', () => {
  let projectId: string;
  let task: Task;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}EMPTY_${RUN_ID}`);
    const statuses = await getTaskStatuses(request, projectId);
    const taskTypes = await getTaskTypes(request, projectId);
    const todo = statuses.find((s) => s.category === 'todo');
    const normalType = taskTypes.find((t) => !t.is_system);
    task = await createTask(request, projectId, `${TEST_PROJECT_PREFIX}TASK_${RUN_ID}`, todo?.id, normalType?.id);
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Empty state when no scenarios exist', async ({ page }) => {
    await signIn(page);
    // the user opens the task detail modal
    await openTaskDetail(page, projectId, task.id);

    // the task has no BDD scenarios — verify the empty state message
    await expect(page.getByText('No BDD scenarios yet')).toBeVisible({ timeout: 10_000 });
  });
});

// =============================================================================
// Rule: CRUD operations on BDD scenarios — Creating
// =============================================================================

test.describe('BDD Scenarios — create', () => {
  let projectId: string;
  let task: Task;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}CREATE_${RUN_ID}`);
    const statuses = await getTaskStatuses(request, projectId);
    const taskTypes = await getTaskTypes(request, projectId);
    const todo = statuses.find((s) => s.category === 'todo');
    const normalType = taskTypes.find((t) => !t.is_system);
    task = await createTask(request, projectId, `${TEST_PROJECT_PREFIX}TASK_${RUN_ID}`, todo?.id, normalType?.id);
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Creating a BDD scenario with a title', async ({ page }) => {
    await signIn(page);
    // the user opens the task detail modal
    await openTaskDetail(page, projectId, task.id);

    // clicks "Add scenario" in the BDD Scenarios section
    await page.getByRole('button', { name: 'Add scenario' }).click();

    // enters a scenario title "User can log in"
    await page.getByRole('textbox', { name: 'Scenario title\u2026' }).fill('User can log in');

    // clicks "Create scenario"
    await page.getByRole('button', { name: 'Create scenario' }).click();

    // the new scenario "User can log in" appears in the BDD Scenarios section
    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'User can log in' }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('No BDD scenarios yet')).not.toBeVisible();
  });

  test('Creating a scenario with Given / When / Then clauses', async ({ page }) => {
    await signIn(page);
    // the user opens the task detail modal
    await openTaskDetail(page, projectId, task.id);

    // clicks "Add scenario" in the BDD Scenarios section
    await page.getByRole('button', { name: 'Add scenario' }).click();

    // enters a scenario title "Successful login"
    await page.getByRole('textbox', { name: 'Scenario title\u2026' }).fill('Successful login');

    // Given / When / Then fields are directly visible in the create form — fills in all clauses
    // fills in the Given clause "a registered user"
    await page.getByRole('textbox', { name: 'the initial context or precondition\u2026' }).fill('a registered user');

    // fills in the When clause "the user submits valid credentials"
    await page.getByRole('textbox', { name: 'the action or event that occurs\u2026' }).fill('the user submits valid credentials');

    // fills in the Then clause "the user is redirected to the dashboard"
    await page.getByRole('textbox', { name: 'the expected outcome or result\u2026' }).fill('the user is redirected to the dashboard');

    // clicks "Create scenario"
    await page.getByRole('button', { name: 'Create scenario' }).click();

    // the scenario "Successful login" appears in the list
    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'Successful login' }),
    ).toBeVisible({ timeout: 8_000 });

    // expanding the scenario reveals the Given, When, and Then clauses
    await page.getByTestId('bdd-scenario-card').locator('div').filter({ hasText: /^Successful login$/ }).click();
    await expect(
      page.getByRole('textbox', { name: 'the initial context or precondition\u2026' }),
    ).toHaveValue('a registered user', { timeout: 5_000 });
    await expect(
      page.getByRole('textbox', { name: 'the action or event that occurs\u2026' }),
    ).toHaveValue('the user submits valid credentials');
    await expect(
      page.getByRole('textbox', { name: 'the expected outcome or result\u2026' }),
    ).toHaveValue('the user is redirected to the dashboard');
  });
});

// =============================================================================
// Rule: CRUD operations on BDD scenarios — Editing
// =============================================================================

test.describe('BDD Scenarios — update', () => {
  let projectId: string;
  let task: Task;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}UPDATE_${RUN_ID}`);
    const statuses = await getTaskStatuses(request, projectId);
    const taskTypes = await getTaskTypes(request, projectId);
    const todo = statuses.find((s) => s.category === 'todo');
    const normalType = taskTypes.find((t) => !t.is_system);
    task = await createTask(request, projectId, `${TEST_PROJECT_PREFIX}TASK_${RUN_ID}`, todo?.id, normalType?.id);
    // a BDD scenario "Old Title" exists on the task
    await createBDDScenario(request, projectId, task.id, { title: 'Old Title' });
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Editing a BDD scenario title inline', async ({ page }) => {
    await signIn(page);
    // the user opens the task detail modal
    await openTaskDetail(page, projectId, task.id);

    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'Old Title' }),
    ).toBeVisible({ timeout: 10_000 });

    // clicks on the title "Old Title" inside the scenario card to enter edit mode
    await page.getByTestId('bdd-scenario-card').locator('div').filter({ hasText: /^Old Title$/ }).click();

    // changes the title to "New Title"
    const titleInput = page.getByTestId('bdd-scenario-card').locator('input');
    await titleInput.clear();
    await titleInput.fill('New Title');

    // blurs the title field — triggers auto-save
    await titleInput.blur();

    // the scenario card shows the updated title "New Title"
    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'New Title' }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'Old Title' }),
    ).not.toBeVisible();
  });
});

// =============================================================================
// Rule: CRUD operations on BDD scenarios — Deleting
// =============================================================================

test.describe('BDD Scenarios — delete', () => {
  let projectId: string;
  let task: Task;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}DELETE_${RUN_ID}`);
    const statuses = await getTaskStatuses(request, projectId);
    const taskTypes = await getTaskTypes(request, projectId);
    const todo = statuses.find((s) => s.category === 'todo');
    const normalType = taskTypes.find((t) => !t.is_system);
    task = await createTask(request, projectId, `${TEST_PROJECT_PREFIX}TASK_${RUN_ID}`, todo?.id, normalType?.id);
    // a BDD scenario "To Be Deleted" exists on the task
    await createBDDScenario(request, projectId, task.id, { title: 'To Be Deleted' });
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Deleting a BDD scenario', async ({ page }) => {
    await signIn(page);
    // the user opens the task detail modal
    await openTaskDetail(page, projectId, task.id);

    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'To Be Deleted' }),
    ).toBeVisible({ timeout: 10_000 });

    // hovers over the "To Be Deleted" scenario card
    const scenarioCard = page.getByTestId('bdd-scenario-card').filter({ hasText: 'To Be Deleted' });
    await scenarioCard.hover();

    // clicks the delete icon on that card
    await page.getByRole('button', { name: 'Delete scenario' }).click();

    // the "To Be Deleted" scenario no longer appears in the list
    await expect(
      page.getByTestId('bdd-scenario-card').filter({ hasText: 'To Be Deleted' }),
    ).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('No BDD scenarios yet')).toBeVisible();
  });
});
