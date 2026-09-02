"""Tests for the health_score service and GET /api/v1/projects/{id}/health-score endpoint."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.health_score import (
    HealthScoreResult,
    calculate_health_score,
)

TEST_DB_URL = "sqlite+aiosqlite://"

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)
LAST_WEEK = TODAY - timedelta(days=7)
NEXT_WEEK = TODAY + timedelta(days=7)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "hs@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "HS User", "password": "testpass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_project(
    client: AsyncClient,
    headers: dict,
    budget_cents: int = 100_000,
    name: str = "Test Project",
) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": name, "budget_cents": budget_cents},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _make_phase(client: AsyncClient, headers: dict, project_id: str, name: str = "Phase 1") -> str:
    resp = await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": name},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _make_task(
    client: AsyncClient,
    headers: dict,
    project_id: str,
    phase_id: str,
    *,
    name: str = "Task",
    status: str = "todo",
    start_date: date | None = None,
    end_date: date | None = None,
    labor_cost_cents: int = 0,
) -> str:
    payload: dict = {"name": name, "status": status, "labor_cost_cents": labor_cost_cents}
    if start_date:
        payload["start_date"] = start_date.isoformat()
    if end_date:
        payload["end_date"] = end_date.isoformat()
    resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Unit tests: calculate_health_score (pure logic, no DB)
# ---------------------------------------------------------------------------


class _FakeTask:
    """Minimal Task stand-in for unit tests."""

    def __init__(
        self,
        *,
        status: str = "todo",
        start_date: date | None = None,
        end_date: date | None = None,
        labor_cost_cents: int = 0,
    ):
        self.id = uuid.uuid4()
        self.status = status
        self.start_date = start_date
        self.end_date = end_date
        self.labor_cost_cents = labor_cost_cents


class _FakePhase:
    def __init__(self, tasks: list[_FakeTask]):
        self.tasks = tasks


class _FakeProject:
    def __init__(self, phases: list[_FakePhase], budget_cents: int = 0):
        self.budget_cents = budget_cents
        self.phases = phases


def test_health_score_all_done_on_time_within_budget():
    """All tasks done, none overdue, no overspend → score near 100."""
    tasks = [
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=1_000),
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=1_000),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert isinstance(result, HealthScoreResult)
    assert result.score == 100
    assert result.status == "green"
    assert result.components["task_completion"] == 100.0
    assert result.components["overdue_tasks"] == 0


def test_health_score_no_tasks():
    """Project with no tasks → neutral score (50), amber."""
    project = _FakeProject([], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert result.score == 50
    assert result.status == "amber"


def test_health_score_all_tasks_overdue():
    """All tasks past end_date and not done → heavy penalty."""
    tasks = [
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="in_progress", end_date=LAST_WEEK),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert result.score < 40
    assert result.status == "red"
    assert result.components["overdue_tasks"] == 2


def test_health_score_half_completion():
    """50% tasks done, no overdue, within budget → amber range."""
    tasks = [
        _FakeTask(status="done", end_date=TOMORROW),
        _FakeTask(status="todo", end_date=TOMORROW),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert result.components["task_completion"] == 50.0
    assert 40 <= result.score < 70
    assert result.status == "amber"


def test_health_score_over_budget():
    """Labor costs exceed budget → score penalty."""
    tasks = [
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=15_000),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    # burn_rate > 1 should reduce score
    assert result.components["budget_burn_rate"] > 1.0
    assert result.score < 100


def test_health_score_within_budget():
    """Spending at 50% of budget → no penalty."""
    tasks = [
        _FakeTask(status="done", end_date=YESTERDAY, labor_cost_cents=5_000),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=10_000)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert result.components["budget_burn_rate"] == pytest.approx(0.5)


def test_health_score_thresholds():
    """Green >= 70, amber >= 40, red < 40."""
    tasks_all_done = [_FakeTask(status="done", end_date=YESTERDAY)]
    project_green = _FakeProject([_FakePhase(tasks_all_done)], budget_cents=10_000)
    assert calculate_health_score(project_green).status == "green"  # type: ignore[arg-type]

    tasks_mixed = [_FakeTask(status="done"), _FakeTask(status="todo")]
    project_amber = _FakeProject([_FakePhase(tasks_mixed)], budget_cents=10_000)
    assert calculate_health_score(project_amber).status == "amber"  # type: ignore[arg-type]

    tasks_all_overdue = [
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="todo", end_date=LAST_WEEK),
        _FakeTask(status="todo", end_date=LAST_WEEK),
    ]
    project_red = _FakeProject([_FakePhase(tasks_all_overdue)], budget_cents=0)
    assert calculate_health_score(project_red).status == "red"  # type: ignore[arg-type]


def test_health_score_score_clamped_0_100():
    """Score must always be in 0-100 range."""
    tasks = [
        _FakeTask(status="todo", end_date=LAST_WEEK, labor_cost_cents=999_999),
        _FakeTask(status="todo", end_date=LAST_WEEK, labor_cost_cents=999_999),
        _FakeTask(status="todo", end_date=LAST_WEEK, labor_cost_cents=999_999),
    ]
    project = _FakeProject([_FakePhase(tasks)], budget_cents=1)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert 0 <= result.score <= 100


def test_health_score_result_has_required_fields():
    """HealthScoreResult exposes score, status, components."""
    project = _FakeProject([], budget_cents=0)
    result = calculate_health_score(project)  # type: ignore[arg-type]

    assert hasattr(result, "score")
    assert hasattr(result, "status")
    assert hasattr(result, "components")
    assert "task_completion" in result.components
    assert "overdue_tasks" in result.components
    assert "budget_burn_rate" in result.components


# ---------------------------------------------------------------------------
# Integration tests: HTTP endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_score_endpoint_no_tasks(client: AsyncClient) -> None:
    """Empty project returns 200 with neutral score."""
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/health-score", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "score" in data
    assert "status" in data
    assert "components" in data
    assert data["status"] == "amber"
    assert data["score"] == 50


@pytest.mark.asyncio
async def test_health_score_endpoint_all_done(client: AsyncClient) -> None:
    """All tasks done → green."""
    headers = await _auth_headers(client, "hs2@example.com")
    project_id = await _make_project(client, headers, budget_cents=50_000)
    phase_id = await _make_phase(client, headers, project_id)
    await _make_task(client, headers, project_id, phase_id, name="T1", status="done",
                     end_date=YESTERDAY, labor_cost_cents=10_000)
    await _make_task(client, headers, project_id, phase_id, name="T2", status="done",
                     end_date=YESTERDAY, labor_cost_cents=10_000)

    resp = await client.get(f"/api/v1/projects/{project_id}/health-score", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "green"
    assert data["score"] == 100


@pytest.mark.asyncio
async def test_health_score_endpoint_overdue_tasks(client: AsyncClient) -> None:
    """Overdue tasks reduce score to red."""
    headers = await _auth_headers(client, "hs3@example.com")
    project_id = await _make_project(client, headers, budget_cents=0)
    phase_id = await _make_phase(client, headers, project_id)
    await _make_task(client, headers, project_id, phase_id, name="T1", status="todo",
                     end_date=LAST_WEEK)
    await _make_task(client, headers, project_id, phase_id, name="T2", status="todo",
                     end_date=LAST_WEEK)
    await _make_task(client, headers, project_id, phase_id, name="T3", status="todo",
                     end_date=LAST_WEEK)

    resp = await client.get(f"/api/v1/projects/{project_id}/health-score", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "red"
    assert data["components"]["overdue_tasks"] == 3


@pytest.mark.asyncio
async def test_health_score_endpoint_404(client: AsyncClient) -> None:
    """Unknown project returns 404."""
    headers = await _auth_headers(client, "hs4@example.com")
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/projects/{fake_id}/health-score", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health_score_endpoint_forbidden(client: AsyncClient) -> None:
    """Another user cannot see the health score."""
    owner_headers = await _auth_headers(client, "hs5owner@example.com")
    other_headers = await _auth_headers(client, "hs5other@example.com")
    project_id = await _make_project(client, owner_headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/health-score", headers=other_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_health_score_endpoint_requires_auth(client: AsyncClient) -> None:
    """Unauthenticated request returns 401."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/projects/{fake_id}/health-score")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health_score_endpoint_over_budget(client: AsyncClient) -> None:
    """Over-budget project reflects burn_rate > 1."""
    headers = await _auth_headers(client, "hs6@example.com")
    project_id = await _make_project(client, headers, budget_cents=5_000)
    phase_id = await _make_phase(client, headers, project_id)
    await _make_task(client, headers, project_id, phase_id, name="T1", status="done",
                     end_date=YESTERDAY, labor_cost_cents=10_000)

    resp = await client.get(f"/api/v1/projects/{project_id}/health-score", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["components"]["budget_burn_rate"] > 1.0
    assert data["score"] < 100
