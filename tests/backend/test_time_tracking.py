"""Tests for ProcessTimeEntry — start/stop/list time tracking."""

import asyncio
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
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "u@example.com") -> dict:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "U", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _setup_project_process(client: AsyncClient, headers: dict) -> str:
    """Create a project, a process, attach them. Returns project_process_id."""
    p = await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    pid = p.json()["id"]
    proc = await client.post(
        "/api/v1/processes/",
        json={"slug": "stucen", "name": "Stucen"},
        headers=headers,
    )
    link = await client.post(
        f"/api/v1/processes/projects/{pid}",
        json={"process_id": proc.json()["id"]},
        headers=headers,
    )
    return link.json()["id"]


# ---------------------------------------------------------------------------
# Start / stop
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_time_entry(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    r = await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["project_process_id"] == pp
    assert body["started_at"] is not None
    assert body["stopped_at"] is None
    assert body["duration_seconds"] is None


@pytest.mark.asyncio
async def test_start_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/time/00000000-0000-0000-0000-000000000000/start", json={}
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_start_unknown_project_process_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post(
        "/api/v1/time/00000000-0000-0000-0000-000000000000/start",
        json={},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_cannot_start_when_already_running(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    r1 = await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_stop_sets_duration(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    r1 = await client.post(
        f"/api/v1/time/{pp}/start", json={"notes": "first"}, headers=headers
    )
    assert r1.status_code == 201
    await asyncio.sleep(1.1)
    r2 = await client.post(
        f"/api/v1/time/{pp}/stop", json={"notes": "done"}, headers=headers
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["stopped_at"] is not None
    assert body["duration_seconds"] is not None
    assert body["duration_seconds"] >= 1
    assert body["notes"] == "done"


@pytest.mark.asyncio
async def test_stop_without_running_returns_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    r = await client.post(f"/api/v1/time/{pp}/stop", json={}, headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_can_start_again_after_stop(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
    await client.post(f"/api/v1/time/{pp}/stop", json={}, headers=headers)
    r = await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_list_time_entries_sums_durations(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    for _ in range(2):
        await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
        await asyncio.sleep(1.1)
        await client.post(f"/api/v1/time/{pp}/stop", json={}, headers=headers)
    r = await client.get(f"/api/v1/time/{pp}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
    assert body["total_seconds"] >= 2
    assert all(e["duration_seconds"] is not None for e in body["data"])


@pytest.mark.asyncio
async def test_list_excludes_open_from_total(client: AsyncClient) -> None:
    headers = await _auth(client)
    pp = await _setup_project_process(client, headers)
    await client.post(f"/api/v1/time/{pp}/start", json={}, headers=headers)
    r = await client.get(f"/api/v1/time/{pp}", headers=headers)
    assert r.status_code == 200
    assert r.json()["total_seconds"] == 0
    assert len(r.json()["data"]) == 1


@pytest.mark.asyncio
async def test_cannot_start_other_users_process(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    pp = await _setup_project_process(client, h1)
    h2 = await _auth(client, "intruder@example.com")
    r = await client.post(f"/api/v1/time/{pp}/start", json={}, headers=h2)
    assert r.status_code == 403
