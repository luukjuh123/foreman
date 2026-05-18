"""Materials router — store integrations and material search."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/search")
async def search_materials(query: str = "") -> dict:
    """Stub — implement in todo item: Backend: Scraping service base."""
    return {"data": [], "error": None, "query": query}
