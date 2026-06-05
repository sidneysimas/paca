# AI Agent Service

Python + FastAPI + OpenHands SDK service responsible for AI agent orchestration.

## Overview

This service:

- Consumes agent trigger events from the `paca:agent:triggers` Valkey Stream.
- Spawns isolated Docker containers via the OpenHands SDK (one per active conversation).
- Runs OpenHands agent conversations with per-agent LLM, skills, MCP servers, and system prompt.
- Publishes conversation events to the `paca:agent:events` Valkey Stream.
- Exposes REST endpoints for pause, resume, stop, and conversation history.

See [../../docs/ai-agent/ai-agent-service.md](../../docs/ai-agent/ai-agent-service.md) for full implementation details.

## Run Locally

```bash
uv sync
uv run uvicorn src.main:app --reload --port 8000
```

## Run Tests

```bash
uv run pytest
```
