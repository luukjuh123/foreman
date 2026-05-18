"""Authentication router — login and register endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def auth_health() -> dict:
    """Stub — implement in todo item: Backend: User authentication."""
    return {"status": "stub"}
