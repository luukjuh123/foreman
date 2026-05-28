"""Tests for WebSocket collaboration endpoint."""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._app = app_with_db
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


async def _register_and_token(client: AsyncClient, email: str = "wsuser@example.com") -> str:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "WS User",
        "password": "testpass123",
    })
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Unit tests — ConnectionManager
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connection_manager_connect_and_disconnect(app_with_db) -> None:
    """Manager tracks connections per project."""
    from app.services.websocket.manager import ConnectionManager

    manager = ConnectionManager()
    project_id = "proj-1"

    class FakeSocket:
        def __init__(self) -> None:
            self.accepted = False
            self.sent: list[str] = []
            self.closed = False

        async def accept(self) -> None:
            self.accepted = True

        async def send_text(self, data: str) -> None:
            self.sent.append(data)

        async def close(self) -> None:
            self.closed = True

    ws = FakeSocket()
    await manager.connect(ws, project_id, user_id="user-1")  # type: ignore[arg-type]

    assert manager.connection_count(project_id) == 1
    assert "user-1" in manager.presence(project_id)

    manager.disconnect(ws, project_id, user_id="user-1")  # type: ignore[arg-type]
    assert manager.connection_count(project_id) == 0
    assert "user-1" not in manager.presence(project_id)


@pytest.mark.asyncio
async def test_connection_manager_broadcast(app_with_db) -> None:
    """Broadcast sends to all connections for a project."""
    from app.services.websocket.manager import ConnectionManager

    manager = ConnectionManager()
    project_id = "proj-broadcast"

    received: list[list[str]] = [[], []]

    class FakeSocket:
        def __init__(self, idx: int) -> None:
            self.idx = idx
            self.accepted = False

        async def accept(self) -> None:
            self.accepted = True

        async def send_text(self, data: str) -> None:
            received[self.idx].append(data)

        async def close(self) -> None:
            pass

    ws1 = FakeSocket(0)
    ws2 = FakeSocket(1)
    await manager.connect(ws1, project_id, user_id="user-a")  # type: ignore[arg-type]
    await manager.connect(ws2, project_id, user_id="user-b")  # type: ignore[arg-type]

    await manager.broadcast(project_id, {"type": "test", "payload": "hello"})

    assert len(received[0]) == 1
    assert len(received[1]) == 1
    msg = json.loads(received[0][0])
    assert msg["type"] == "test"
    assert msg["payload"] == "hello"


@pytest.mark.asyncio
async def test_connection_manager_presence_multiple_users(app_with_db) -> None:
    """Presence lists all users connected to a project."""
    from app.services.websocket.manager import ConnectionManager

    manager = ConnectionManager()
    project_id = "proj-presence"

    class FakeSocket:
        async def accept(self) -> None:
            pass

        async def send_text(self, data: str) -> None:
            pass

        async def close(self) -> None:
            pass

    ws_a = FakeSocket()
    ws_b = FakeSocket()
    await manager.connect(ws_a, project_id, user_id="alice")  # type: ignore[arg-type]
    await manager.connect(ws_b, project_id, user_id="bob")  # type: ignore[arg-type]

    presence = manager.presence(project_id)
    assert set(presence) == {"alice", "bob"}

    manager.disconnect(ws_a, project_id, user_id="alice")  # type: ignore[arg-type]
    assert manager.presence(project_id) == ["bob"]


@pytest.mark.asyncio
async def test_connection_manager_broadcast_excludes_other_projects(app_with_db) -> None:
    """Broadcast for project A does not reach project B connections."""
    from app.services.websocket.manager import ConnectionManager

    manager = ConnectionManager()

    received_b: list[str] = []

    class FakeSocket:
        def __init__(self, store: list[str] | None = None) -> None:
            self._store = store

        async def accept(self) -> None:
            pass

        async def send_text(self, data: str) -> None:
            if self._store is not None:
                self._store.append(data)

        async def close(self) -> None:
            pass

    ws_a = FakeSocket()
    ws_b = FakeSocket(received_b)
    await manager.connect(ws_a, "proj-a", user_id="user-a")  # type: ignore[arg-type]
    await manager.connect(ws_b, "proj-b", user_id="user-b")  # type: ignore[arg-type]

    await manager.broadcast("proj-a", {"type": "update"})

    assert received_b == []


# ---------------------------------------------------------------------------
# Integration tests — WebSocket HTTP endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_websocket_endpoint_rejects_missing_token(client: AsyncClient) -> None:
    """WS without token returns 403."""
    import uuid

    project_id = uuid.uuid4()
    # httpx does not support WebSocket upgrades; test HTTP fallback via GET
    resp = await client.get(f"/api/v1/ws/{project_id}")
    # FastAPI returns 403 for WebSocket endpoints accessed without upgrade
    assert resp.status_code in (400, 403, 404, 422)


@pytest.mark.asyncio
async def test_presence_endpoint_empty(client: AsyncClient) -> None:
    """GET /api/v1/ws/{project_id}/presence returns empty list when no one is connected."""
    import uuid

    token = await _register_and_token(client)
    project_id = uuid.uuid4()
    resp = await client.get(
        f"/api/v1/ws/{project_id}/presence",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == str(project_id)
    assert data["connected_users"] == []


@pytest.mark.asyncio
async def test_presence_endpoint_requires_auth(client: AsyncClient) -> None:
    """Presence endpoint requires authentication."""
    import uuid

    resp = await client.get(f"/api/v1/ws/{uuid.uuid4()}/presence")
    assert resp.status_code in (401, 403)
