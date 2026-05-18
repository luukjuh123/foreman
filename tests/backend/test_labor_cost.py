"""Tests for the labor cost estimation service and endpoint (Phase 7)."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.services.financials.labor_cost import (
    DEFAULT_HOURLY_RATE_CENTS,
    LaborCostEstimator,
)

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def app_with_db(session_factory):
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "lc@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "LC", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed(session_factory, *, tasks: list[dict]) -> uuid.UUID:
    project_id = uuid.uuid4()
    async with session_factory() as s:
        owner_id = uuid.uuid4()
        s.add(User(id=owner_id, email=f"{owner_id}@x.io", name="u", hashed_password="x"))
        s.add(Project(id=project_id, owner_id=owner_id, name="P"))
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Ph"))
        for t in tasks:
            s.add(Task(phase_id=phase_id, **t))
        await s.commit()
    return project_id


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_estimator_uses_default_rate_when_none_supplied(session_factory) -> None:
    project_id = await _seed(
        session_factory, tasks=[{"name": "T1", "estimated_hours": 4.0}]
    )
    async with session_factory() as s:
        report = await LaborCostEstimator().estimate(project_id, s)
    assert report.hourly_rate_cents == DEFAULT_HOURLY_RATE_CENTS
    # 4 hours × default rate
    assert report.total_cents == int(4.0 * DEFAULT_HOURLY_RATE_CENTS)


@pytest.mark.asyncio
async def test_estimator_sums_hours_at_custom_rate(session_factory) -> None:
    project_id = await _seed(
        session_factory,
        tasks=[
            {"name": "A", "estimated_hours": 2.0},
            {"name": "B", "estimated_hours": 5.5},
        ],
    )
    async with session_factory() as s:
        report = await LaborCostEstimator(hourly_rate_cents=5000).estimate(project_id, s)
    # 7.5 hours × 5000 cents = 37500
    assert report.total_cents == 37500
    assert report.total_hours == pytest.approx(7.5)
    assert len(report.tasks) == 2


@pytest.mark.asyncio
async def test_estimator_skips_tasks_with_zero_hours(session_factory) -> None:
    project_id = await _seed(
        session_factory,
        tasks=[
            {"name": "real", "estimated_hours": 3.0},
            {"name": "unscoped", "estimated_hours": 0.0},
        ],
    )
    async with session_factory() as s:
        report = await LaborCostEstimator(hourly_rate_cents=4000).estimate(project_id, s)
    # 3 hours × 4000 cents = 12000
    assert report.total_cents == 12000
    # 'unscoped' task is reported but contributes 0
    assert {t.name for t in report.tasks} == {"real", "unscoped"}
    unscoped = next(t for t in report.tasks if t.name == "unscoped")
    assert unscoped.cost_cents == 0


@pytest.mark.asyncio
async def test_estimator_rejects_negative_rate() -> None:
    with pytest.raises(ValueError):
        LaborCostEstimator(hourly_rate_cents=-1)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_labor_cost_endpoint_default_rate(
    client: AsyncClient, session_factory
) -> None:
    headers = await _auth_headers(client)
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "T", "estimated_hours": 8.0},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/labor-cost", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["hourly_rate_cents"] == DEFAULT_HOURLY_RATE_CENTS
    assert body["total_cents"] == int(8.0 * DEFAULT_HOURLY_RATE_CENTS)
    assert len(body["tasks"]) == 1


@pytest.mark.asyncio
async def test_labor_cost_endpoint_custom_rate_query(
    client: AsyncClient, session_factory
) -> None:
    headers = await _auth_headers(client)
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "T", "estimated_hours": 10.0},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/labor-cost?hourly_rate_cents=7500",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["hourly_rate_cents"] == 7500
    assert body["total_cents"] == 75000


@pytest.mark.asyncio
async def test_labor_cost_endpoint_rejects_negative_rate(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/labor-cost?hourly_rate_cents=-1",
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_labor_cost_endpoint_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "owner@example.com")
    h2 = await _auth_headers(client, "stranger@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/labor-cost", headers=h2
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_labor_cost_endpoint_empty_project_is_zero(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/labor-cost", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_cents"] == 0
    assert body["tasks"] == []
