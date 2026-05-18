"""Tests for /api/agenda endpoints (weekly + daily + range views)."""

from datetime import date, timedelta

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


async def _auth_headers(client: AsyncClient, email: str = "agenda@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "A", "password": "testpass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_project_with_task(
    client: AsyncClient,
    headers: dict,
    *,
    project_name: str = "Bouw",
    task_name: str = "Stucen",
    task_start: date,
    task_end: date,
) -> dict:
    project = (
        await client.post("/api/v1/projects/", json={"name": project_name}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{project['id']}/phases",
            json={"name": "Phase 1"},
            headers=headers,
        )
    ).json()
    task = (
        await client.post(
            f"/api/v1/projects/{project['id']}/phases/{phase['id']}/tasks",
            json={
                "name": task_name,
                "start_date": task_start.isoformat(),
                "end_date": task_end.isoformat(),
            },
            headers=headers,
        )
    ).json()
    return {"project": project, "phase": phase, "task": task}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_week_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/agenda/week")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_day_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/agenda/day")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_range_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/agenda/range?start=2025-01-01&end=2025-01-02")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Week view
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_week_view_empty(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    monday = date(2025, 1, 6)  # a Monday
    resp = await client.get(f"/api/agenda/week?week_start={monday.isoformat()}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["week_start"] == monday.isoformat()
    assert data["week_end"] == (monday + timedelta(days=6)).isoformat()
    assert len(data["days"]) == 7
    assert all(d["tasks"] == [] for d in data["days"])


@pytest.mark.asyncio
async def test_week_view_normalizes_to_monday(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    # Wednesday Jan 8 2025 -> Monday Jan 6 2025
    resp = await client.get("/api/agenda/week?week_start=2025-01-08", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["week_start"] == "2025-01-06"


@pytest.mark.asyncio
async def test_week_view_groups_tasks_by_day(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    monday = date(2025, 1, 6)
    await _make_project_with_task(
        client,
        headers,
        project_name="Verbouwing",
        task_name="Stucen",
        task_start=monday + timedelta(days=1),  # Tue
        task_end=monday + timedelta(days=3),    # Thu
    )

    resp = await client.get(f"/api/agenda/week?week_start={monday.isoformat()}", headers=headers)
    assert resp.status_code == 200
    days = resp.json()["days"]
    assert [len(d["tasks"]) for d in days] == [0, 1, 1, 1, 0, 0, 0]
    tue_task = days[1]["tasks"][0]
    assert tue_task["name"] == "Stucen"
    assert tue_task["project_name"] == "Verbouwing"
    assert "phase_id" in tue_task
    assert "project_id" in tue_task


@pytest.mark.asyncio
async def test_week_view_isolates_users(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "u1@x.com")
    h2 = await _auth_headers(client, "u2@x.com")
    monday = date(2025, 2, 3)
    await _make_project_with_task(
        client, h1, project_name="Mine", task_start=monday, task_end=monday
    )
    resp = await client.get(f"/api/agenda/week?week_start={monday.isoformat()}", headers=h2)
    assert resp.status_code == 200
    assert all(d["tasks"] == [] for d in resp.json()["days"])


@pytest.mark.asyncio
async def test_week_view_excludes_undated_tasks(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{project['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{project['id']}/phases/{phase['id']}/tasks",
        json={"name": "Floating"},
        headers=headers,
    )
    resp = await client.get("/api/agenda/week?week_start=2025-01-06", headers=headers)
    assert all(d["tasks"] == [] for d in resp.json()["days"])


@pytest.mark.asyncio
async def test_week_view_excludes_soft_deleted_projects(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    monday = date(2025, 1, 6)
    bundle = await _make_project_with_task(
        client, headers, task_start=monday, task_end=monday
    )
    await client.delete(f"/api/v1/projects/{bundle['project']['id']}", headers=headers)
    resp = await client.get(f"/api/agenda/week?week_start={monday.isoformat()}", headers=headers)
    assert all(d["tasks"] == [] for d in resp.json()["days"])


# ---------------------------------------------------------------------------
# Day view
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_day_view_empty(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/agenda/day?day=2025-01-06", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["date"] == "2025-01-06"
    assert body["tasks"] == []


@pytest.mark.asyncio
async def test_day_view_returns_tasks_spanning_day(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    target = date(2025, 3, 12)
    await _make_project_with_task(
        client,
        headers,
        task_name="Tegelen",
        task_start=target - timedelta(days=1),
        task_end=target + timedelta(days=1),
    )
    await _make_project_with_task(
        client,
        headers,
        project_name="P2",
        task_name="Off",
        task_start=target + timedelta(days=5),
        task_end=target + timedelta(days=6),
    )

    resp = await client.get(f"/api/agenda/day?day={target.isoformat()}", headers=headers)
    body = resp.json()
    assert body["date"] == target.isoformat()
    names = [t["name"] for t in body["tasks"]]
    assert names == ["Tegelen"]


# ---------------------------------------------------------------------------
# Range view
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_range_view_basic(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    start = date(2025, 4, 1)
    end = date(2025, 4, 3)
    await _make_project_with_task(client, headers, task_start=start, task_end=end)

    resp = await client.get(
        f"/api/agenda/range?start={start.isoformat()}&end={end.isoformat()}",
        headers=headers,
    )
    assert resp.status_code == 200
    days = resp.json()
    assert len(days) == 3
    assert all(len(d["tasks"]) == 1 for d in days)


@pytest.mark.asyncio
async def test_range_view_rejects_inverted_range(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        "/api/agenda/range?start=2025-04-10&end=2025-04-01", headers=headers
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_range_view_rejects_huge_range(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(
        "/api/agenda/range?start=2020-01-01&end=2025-01-01", headers=headers
    )
    assert resp.status_code == 422
