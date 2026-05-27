"""Tests for GET /api/v1/dashboard/stats."""

import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
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


async def _auth(client, email="owner@example.com"):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Owner", "password": "supersecret"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_project(client, headers, name="Test Project", status="active"):
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": name, "status": status},
        headers=headers,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _make_staff(client, headers, name="Jan", weekly_hours=40.0):
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": name, "role": "carpenter", "hourly_rate_cents": 4000, "weekly_hours_target": weekly_hours},
        headers=headers,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_stats_requires_auth(client):
    """Unauthenticated request returns 401/403."""
    resp = await client.get("/api/v1/dashboard/stats")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_stats_shape(client):
    """Stats endpoint returns the expected JSON shape."""
    h = await _auth(client)
    resp = await client.get("/api/v1/dashboard/stats", headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "active_projects" in body
    assert "overdue_tasks" in body
    assert "monthly_revenue_cents" in body
    assert "outstanding_cents" in body
    assert "staff_utilization_pct" in body


@pytest.mark.asyncio
async def test_stats_all_zeros_when_no_data(client):
    """New account with no data returns all zeros."""
    h = await _auth(client, email="empty@example.com")
    resp = await client.get("/api/v1/dashboard/stats", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["active_projects"] == 0
    assert body["overdue_tasks"] == 0
    assert body["monthly_revenue_cents"] == 0
    assert body["outstanding_cents"] == 0
    assert body["staff_utilization_pct"] == 0.0


@pytest.mark.asyncio
async def test_stats_active_projects_count(client):
    """active_projects counts only status='active' non-deleted projects."""
    h = await _auth(client, email="projects@example.com")
    await _make_project(client, h, name="Active 1", status="active")
    await _make_project(client, h, name="Active 2", status="active")
    await _make_project(client, h, name="Draft 1", status="draft")
    await _make_project(client, h, name="Completed 1", status="completed")

    resp = await client.get("/api/v1/dashboard/stats", headers=h)
    assert resp.status_code == 200
    assert resp.json()["active_projects"] == 2


@pytest.mark.asyncio
async def test_stats_utilization_no_staff(client):
    """staff_utilization_pct is 0.0 when there are no active staff."""
    h = await _auth(client, email="nostaffutil@example.com")
    resp = await client.get("/api/v1/dashboard/stats", headers=h)
    assert resp.status_code == 200
    assert resp.json()["staff_utilization_pct"] == 0.0


@pytest.mark.asyncio
async def test_stats_utilization_with_assignments(client):
    """staff_utilization_pct is calculated from this week's assignments."""
    h = await _auth(client, email="util@example.com")

    # Create a staff member with 40 hours/week target
    sid = await _make_staff(client, h, name="Worker", weekly_hours=40.0)
    pid = await _make_project(client, h, name="Work Project")

    # Create an assignment for 20 hours this week
    now = datetime.now(timezone.utc)
    # Start of this week (Monday)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=8, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(hours=20)

    resp = await client.post(
        "/api/v1/assignments/",
        json={
            "staff_id": sid,
            "project_id": pid,
            "start_at": week_start.isoformat(),
            "end_at": week_end.isoformat(),
        },
        headers=h,
    )
    assert resp.status_code == 201, resp.text

    stats = await client.get("/api/v1/dashboard/stats", headers=h)
    assert stats.status_code == 200
    body = stats.json()
    # 20 / 40 * 100 = 50.0%
    assert body["staff_utilization_pct"] == pytest.approx(50.0, abs=0.1)


@pytest.mark.asyncio
async def test_stats_owner_isolation(client):
    """Stats are scoped to the current user only."""
    h1 = await _auth(client, email="owner1@example.com")
    h2 = await _auth(client, email="owner2@example.com")

    # owner1 creates 3 active projects
    for i in range(3):
        await _make_project(client, h1, name=f"P{i}", status="active")

    # owner2 creates 1 active project
    await _make_project(client, h2, name="P_other", status="active")

    r1 = await client.get("/api/v1/dashboard/stats", headers=h1)
    r2 = await client.get("/api/v1/dashboard/stats", headers=h2)

    assert r1.json()["active_projects"] == 3
    assert r2.json()["active_projects"] == 1
