# Services

This directory contains backend runtime services.

## Services

- `api` — Go + Gin application backend (business logic, REST API, WASM plugin runtime).
- `realtime` — Node.js + Socket.IO real-time event fan-out.
- `ai-agent` — Python + FastAPI + OpenHands SDK AI agent orchestration.

Service boundaries are documented in [../docs/architecture/service-boundaries.md](../docs/architecture/service-boundaries.md).
