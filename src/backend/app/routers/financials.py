"""Financials router — budget tracking and cost aggregation."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/projects/{project_id}/budget")
async def get_budget(project_id: str) -> dict:
    """Stub — implement in todo item: Backend: Budget model and cost tracking endpoints."""
    return {"data": None, "error": None}
