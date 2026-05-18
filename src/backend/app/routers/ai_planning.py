"""AI Planning router — generate task ordering and schedule optimization."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def planning_health() -> dict:
    """Stub — implement in todo item: Backend: AI agent service."""
    return {"status": "stub"}
