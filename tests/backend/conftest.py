"""Shared pytest fixtures for foreman backend tests."""

import pathlib
import sys

# Ensure src/backend is on sys.path regardless of how pytest resolves rootdir.
# pytest's pythonpath ini option is set after initial conftest loading, so
# we add it explicitly here.
_BACKEND_SRC = pathlib.Path(__file__).parent.parent.parent / "src" / "backend"
if str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """Async test client for the FastAPI app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
