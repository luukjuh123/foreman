"""Tests for GET /api/v1/staff/utilization endpoint."""

from datetime import UTC, datetime, timedelta

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
            "full_name": "Test Worker",
            "role": "carpenter",
            "hourly_rate_cents": 4000,
            "weekly_hours_target": weekly_hours,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": "Test Project", "budget_cents": 100000},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_assignment(
    client: AsyncClient, headers: dict, staff_id: str, project_id: str, start_at: str, end_at: str
) -> None:
    resp = await client.post(
        "/api/v1/assignments/",
        json={
            "staff_id": staff_id,
            "project_id": project_id,
            "start_at": start_at,
            "end_at": end_at,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_utilization_no_staff_returns_zero(client: AsyncClient) -> None:
    """With no staff, utilization rate is 0.0."""
    headers = await _auth(client)
    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["utilization_rate"] == 0.0
    assert body["assigned_hours"] == 0.0
    assert body["available_hours"] == 0.0


@pytest.mark.asyncio
async def test_utilization_response_schema(client: AsyncClient) -> None:
    """Response always has utilization_rate, assigned_hours, available_hours keys."""
    headers = await _auth(client)
    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "utilization_rate" in body
    assert "assigned_hours" in body
    assert "available_hours" in body


@pytest.mark.asyncio
async def test_utilization_staff_no_assignments(client: AsyncClient) -> None:
    """Staff with no assignments this week → utilization_rate = 0.0, available_hours > 0."""
    headers = await _auth(client)
    await _create_staff(client, headers, weekly_hours=40.0)

    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["available_hours"] == 40.0
    assert body["assigned_hours"] == 0.0
    assert body["utilization_rate"] == 0.0


@pytest.mark.asyncio
async def test_utilization_with_full_week_assignment(client: AsyncClient) -> None:
    """Staff with 40h assignment this week → utilization_rate = 100.0 (capped)."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers, weekly_hours=40.0)
    project_id = await _create_project(client, headers)

    # Monday of current week 09:00-17:00 × 5 days = 40h
    today = datetime.now(UTC).date()
    monday = today - timedelta(days=today.weekday())

    start = datetime(monday.year, monday.month, monday.day, 9, 0, 0, tzinfo=UTC)
    end = start + timedelta(hours=40)

    await _create_assignment(
        client, headers, staff_id, project_id,
        start.isoformat(), end.isoformat()
    )

    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["assigned_hours"] == pytest.approx(40.0, abs=0.1)
    assert body["available_hours"] == pytest.approx(40.0, abs=0.1)
    assert body["utilization_rate"] == pytest.approx(100.0, abs=0.1)


@pytest.mark.asyncio
async def test_utilization_partial_assignment(client: AsyncClient) -> None:
    """Staff with 20h assignment out of 40h available → 50.0% utilization."""
    headers = await _auth(client)
    staff_id = await _create_staff(client, headers, weekly_hours=40.0)
    project_id = await _create_project(client, headers)

    today = datetime.now(UTC).date()
    monday = today - timedelta(days=today.weekday())
    start = datetime(monday.year, monday.month, monday.day, 9, 0, 0, tzinfo=UTC)
    end = start + timedelta(hours=20)

    await _create_assignment(
        client, headers, staff_id, project_id,
        start.isoformat(), end.isoformat()
    )

    resp = await client.get("/api/v1/staff/utilization", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["assigned_hours"] == pytest.approx(20.0, abs=0.1)
    assert body["available_hours"] == pytest.approx(40.0, abs=0.1)
    assert body["utilization_rate"] == pytest.approx(50.0, abs=0.1)


@pytest.mark.asyncio
async def test_utilization_excludes_other_owners_staff(client: AsyncClient) -> None:
    """Staff from a different owner is not counted."""
    h1 = await _auth(client, "owner1@example.com")
    h2 = await _auth(client, "owner2@example.com")

    # owner2 creates staff + project + assignment
    staff_id = await _create_staff(client, h2, weekly_hours=40.0)
    project_id = await _create_project(client, h2)
    today = datetime.now(UTC).date()
    monday = today - timedelta(days=today.weekday())
    start = datetime(monday.year, monday.month, monday.day, 9, 0, tzinfo=UTC)
    await _create_assignment(client, h2, staff_id, project_id, start.isoformat(), (start + timedelta(hours=20)).isoformat())

    # owner1 should see zero
    resp = await client.get("/api/v1/staff/utilization", headers=h1)
    assert resp.status_code == 200
    body = resp.json()
    assert body["available_hours"] == 0.0
    assert body["utilization_rate"] == 0.0


@pytest.mark.asyncio
async def test_utilization_requires_auth(client: AsyncClient) -> None:
    """Unauthenticated requests are rejected."""
    resp = await client.get("/api/v1/staff/utilization")
    assert resp.status_code == 401
