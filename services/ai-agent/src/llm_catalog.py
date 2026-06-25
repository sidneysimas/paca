"""Loads the pre-generated LLM provider/model catalog (data/llm_models.json).

Shared by the `/llm/models` route (frontend provider dropdown) and
`agent.builder.build_llm` (decides whether a provider needs OpenAI-compatible
passthrough routing). Both must agree on what counts as a "known" provider.
"""

from __future__ import annotations

import json
from pathlib import Path

_DATA_FILE = Path(__file__).parent.parent / "data" / "llm_models.json"

# Loaded once on first request, then cached for the lifetime of the process.
_cache: dict | None = None


def load() -> dict:
    global _cache
    if _cache is None:
        if not _DATA_FILE.exists():
            raise FileNotFoundError(
                f"Model list not found at {_DATA_FILE}. "
                "Run scripts/generate_llm_models.py to generate it."
            )
        _cache = json.loads(_DATA_FILE.read_text())
    return _cache
