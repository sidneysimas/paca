# Service Boundaries

Paca consists of one frontend application, an MCP server, and three backend services.

## apps/web

Responsible for the user-facing product experience.

Concerns:

- authentication and session-driven UI flow;
- board, backlog, and sprint management interfaces;
- human and AI agent collaboration views;
- real-time board updates via Socket.IO;
- product-facing components built with React, TanStack Start, and shadcn/ui.

## apps/mcp

Responsible for AI agent integration via the Model Context Protocol.

Concerns:

- MCP server implementation (`@paca-ai/paca-mcp` npm package);
- translating MCP tool calls into REST calls to `services/api`;
- permission-based tool filtering (user mode and agent mode);
- dynamic loading of plugin-contributed MCP tools at startup;
- BlockNote ↔ Markdown format conversion for descriptions and documents.

## apps/e2e

Responsible for end-to-end validation of the full running stack from a real browser.

Concerns:

- Playwright test suites exercising cross-cutting flows spanning `apps/web`, `services/api`, and the Caddy gateway;
- test categories: auth flows, form validation, security (injection/XSS rejection), session management, and UX correctness;
- Page Object Models and shared fixtures to keep test logic stable as the UI evolves;
- global setup that logs in once and persists browser auth state.

Not deployed. Runs against a live environment (local or CI stack) and produces an HTML report with traces and screenshots on failure.

## services/api

Responsible for the core application backend.

Concerns:

- business workflows (tasks, sprints, boards, members, documents, custom fields);
- authentication and authorization (JWT, API keys, role-based permissions);
- persistence coordination with PostgreSQL and Valkey;
- S3-compatible file attachment handling (MinIO or AWS S3);
- WASM plugin runtime (wazero) — loads backend plugins, registers routes, mediates host function calls;
- publication of domain events to Valkey Streams for downstream consumers;
- agent trigger event publication and conversation summary ingestion.

## services/realtime

Responsible for real-time delivery to connected clients.

Concerns:

- Socket.IO namespaces, rooms, and client connection lifecycle;
- authentication and authorization of socket connections using contracts from `services/api`;
- consumption of Valkey Stream messages emitted by `services/api`;
- transformation of internal domain events into client-safe real-time payloads;
- broadcast of updates for boards, tasks, comments, agent conversation events, and collaboration signals.

## services/ai-agent

Responsible for AI agent orchestration and execution.

Concerns:

- consumption of agent trigger events from the `paca:agent:triggers` Valkey Stream;
- spawning and managing Docker containers via the OpenHands SDK (one container per active conversation);
- running OpenHands agent conversations with per-agent LLM, skills, MCP servers, and system prompt config;
- publishing conversation events to the `paca:agent:events` Valkey Stream for real-time delivery;
- REST endpoints for pause, resume, stop, and history operations;
- repository access via the repository plugin adapter (short-lived tokens, no persistent credential storage).

## Boundary Rule

Keep ownership clear. `services/api` owns business rules and durable state transitions. `services/realtime` only delivers live updates derived from API-owned events. `services/ai-agent` executes agent conversations and reports results back through `services/api` — it does not write directly to the database. Shared code stays inside the owning runtime until duplication is real and proven.
