"""LLM models endpoint — serves the pre-generated provider/model list."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import llm_catalog

router = APIRouter(prefix="/llm")


@router.get("/models")
async def list_llm_models() -> dict[str, dict]:
    """Return the pre-generated LLM model/provider list.

    Refresh the list by running scripts/generate_llm_models.py and restarting
    the service (or simply redeploying the updated data/llm_models.json).
    """
    try:
        return llm_catalog.load()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
