"""Tests for GET /api/v1/staff/utilization endpoint."""

import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
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


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_staff(client: AsyncClient, headers: dict, weekly_hours: float = 40.0) -> str:
    resp = await client.post(
        "/api/v1/staff/",
        json={
            "full_name": "Alice Smith",
            "role": "Builder",
            "hourly_rate_cents": 5000,
            "weekly_hours_target": weekly_hours,
            "active": True,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={
            "name": "Test Project",
            "status": "active",
            "budget_cents": 100000,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_assignment(
    client: AsyncClient,
    headers: dict,
    staff_id: str,
    project_id: str,
    start_at: datetime,
    end_at: datetime,
) -> None:
    resp = await client.post(
        "/api/v1/assignments/",
        json={
            "staff_id": staff_id,
            "project_id": project_id,
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=headers,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_utilization_no_staff_returns_zero(client: AsyncClient) -> None:
    """With no staff at all, utilization is 0%."""
    headers = await _auth(client)
    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["utilization_percent"] == 0.0
    assert data["assigned_hours"] == 0.0
    assert data["available_hours"] == 0.0


@pytest.mark.asyncio
async def test_utilization_staff_no_assignments(client: AsyncClient) -> None:
    """Staff exist but no assignments this week — utilization is 0%."""
    headers = await _auth(client)
    await _create_staff(client, headers, weekly_hours=40.0)

    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["utilization_percent"] == 0.0
    assert data["assigned_hours"] == 0.0
    assert data["available_hours"] == 40.0


@pytest.mark.asyncio
async def test_utilization_with_assignment_this_week(client: AsyncClient) -> None:
    """Staff with 8h assignment this week out of 40h available = 20%."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers, weekly_hours=40.0)
    project_id = await _create_project(client, headers)

    # Monday 08:00 to 16:00 = 8 hours this week (use a fixed Monday in the future)
    now = datetime.now(timezone.utc)
    # Find Monday of this week
    days_since_monday = now.weekday()
    monday = now - timedelta(days=days_since_monday)
    monday_start = monday.replace(hour=8, minute=0, second=0, microsecond=0)
    monday_end = monday.replace(hour=16, minute=0, second=0, microsecond=0)

    await _create_assignment(client, headers, staff_id, project_id, monday_start, monday_end)

    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["assigned_hours"] == pytest.approx(8.0, abs=0.1)
    assert data["available_hours"] == 40.0
    assert data["utilization_percent"] == pytest.approx(20.0, abs=0.5)


@pytest.mark.asyncio
async def test_utilization_ignores_other_users_staff(client: AsyncClient) -> None:
    """Utilization only counts the authenticated user's staff."""
    headers_a = await _auth(client, email="a@example.com")
    headers_b = await _auth(client, email="b@example.com")

    # User B has 1 staff member with 40h target
    await _create_staff(client, headers_b, weekly_hours=40.0)

    # User A has no staff
    resp = await client.get("/api/v1/staff/utilization", headers=headers_a)
    assert resp.status_code == 200
    data = resp.json()
    assert data["available_hours"] == 0.0
    assert data["utilization_percent"] == 0.0


@pytest.mark.asyncio
async def test_utilization_requires_auth(client: AsyncClient) -> None:
    """Unauthenticated request returns 401."""
    resp = await client.get("/api/v1/staff/utilization")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_utilization_ignores_inactive_staff(client: AsyncClient) -> None:
    """Inactive staff are excluded from available_hours calculation."""
    headers = await _auth(client)
    # Create active staff
    await _create_staff(client, headers, weekly_hours=40.0)
    # Create inactive staff
    resp = await client.post(
        "/api/v1/staff/",
        json={
            "full_name": "Inactive Bob",
            "role": "Painter",
            "hourly_rate_cents": 4000,
            "weekly_hours_target": 40.0,
            "active": False,
        },
        headers=headers,
    )
    assert resp.status_code == 201

    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # Only active staff's hours count
    assert data["available_hours"] == 40.0
