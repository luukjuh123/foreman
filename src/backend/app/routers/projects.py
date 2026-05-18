"""Projects router — CRUD for projects, phases, tasks."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_projects() -> dict:
    """Stub — implement in todo item: Backend: CRUD endpoints for projects."""
    return {"data": [], "error": None}
