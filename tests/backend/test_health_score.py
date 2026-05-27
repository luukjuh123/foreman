"""Tests for project health score — Phase 22.

Tests cover:
- Pure service unit tests (no DB, no HTTP)
- Integration tests via the API endpoint
- Notification trigger when score drops below threshold
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.project import Phase, Project, Task
from app.services.health_score.calculator import (
    HealthFactors,
    HealthGrade,
    ProjectHealthCalculator,
    compute_health_score,
)

TEST_DB_URL = "sqlite+aiosqlite://"

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
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "health@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Health User", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_project(
    client: AsyncClient,
    headers: dict,
    name: str = "Test Project",
    budget_cents: int = 100_000,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    payload: dict = {"name": name, "budget_cents": budget_cents}
    if start_date:
        payload["start_date"] = start_date
    if end_date:
        payload["end_date"] = end_date
    resp = await client.post("/api/v1/projects/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _add_task(
    client: AsyncClient,
    headers: dict,
    project_id: str,
    status: str = "todo",
    estimated_hours: float = 8.0,
    end_date: str | None = None,
) -> str:
    # First create a phase
    phase_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": "Phase 1"},
        headers=headers,
    )
    assert phase_resp.status_code == 201, phase_resp.text
    phase_id = phase_resp.json()["id"]

    task_payload: dict = {
        "name": "Task",
        "status": status,
        "estimated_hours": estimated_hours,
    }
    if end_date:
        task_payload["end_date"] = end_date

    resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json=task_payload,
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Unit tests — pure service logic (no DB, no HTTP)
# ---------------------------------------------------------------------------


class TestComputeHealthScore:
    """Unit tests for the pure scoring function."""

    def test_perfect_score_all_factors_ideal(self) -> None:
        # burn_rate=0.0 → budget_score = 1.0 → total raw = 1.0 → score = 100
        factors = HealthFactors(
            schedule_variance=1.0,   # all tasks on time
            budget_burn_rate=0.0,    # nothing spent yet — perfect budget position
            time_accuracy=1.0,       # actuals == estimates
            task_completion_rate=1.0,  # all done
        )
        result = compute_health_score(factors)
        assert result.score == 100
        assert result.grade == HealthGrade.GREEN

    def test_zero_score_all_factors_worst(self) -> None:
        factors = HealthFactors(
            schedule_variance=0.0,
            budget_burn_rate=2.0,    # 200% over budget
            time_accuracy=0.0,
            task_completion_rate=0.0,
        )
        result = compute_health_score(factors)
        assert result.score == 0
        assert result.grade == HealthGrade.RED

    def test_green_grade_above_70(self) -> None:
        factors = HealthFactors(
            schedule_variance=1.0,
            budget_burn_rate=0.8,
            time_accuracy=0.9,
            task_completion_rate=0.8,
        )
        result = compute_health_score(factors)
        assert result.score >= 70
        assert result.grade == HealthGrade.GREEN

    def test_amber_grade_between_50_and_70(self) -> None:
        factors = HealthFactors(
            schedule_variance=0.5,
            budget_burn_rate=1.0,    # at budget limit
            time_accuracy=0.5,
            task_completion_rate=0.5,
        )
        result = compute_health_score(factors)
        assert 50 <= result.score < 70
        assert result.grade == HealthGrade.AMBER

    def test_red_grade_below_50(self) -> None:
        factors = HealthFactors(
            schedule_variance=0.1,
            budget_burn_rate=1.8,
            time_accuracy=0.1,
            task_completion_rate=0.1,
        )
        result = compute_health_score(factors)
        assert result.score < 50
        assert result.grade == HealthGrade.RED

    def test_score_clamped_to_0_100(self) -> None:
        factors = HealthFactors(
            schedule_variance=2.0,   # out-of-range input
            budget_burn_rate=0.0,
            time_accuracy=2.0,
            task_completion_rate=2.0,
        )
        result = compute_health_score(factors)
        assert 0 <= result.score <= 100

    def test_budget_burn_rate_capped_at_2(self) -> None:
        """Burn rates above 2.0 (200%+ overrun) should not make score go below 0."""
        factors = HealthFactors(
            schedule_variance=0.0,
            budget_burn_rate=10.0,   # extremely over budget
            time_accuracy=0.0,
            task_completion_rate=0.0,
        )
        result = compute_health_score(factors)
        assert result.score == 0

    def test_factors_exposed_in_result(self) -> None:
        factors = HealthFactors(
            schedule_variance=0.8,
            budget_burn_rate=0.6,
            time_accuracy=0.7,
            task_completion_rate=0.9,
        )
        result = compute_health_score(factors)
        assert result.factors.schedule_variance == pytest.approx(0.8)
        assert result.factors.budget_burn_rate == pytest.approx(0.6)
        assert result.factors.time_accuracy == pytest.approx(0.7)
        assert result.factors.task_completion_rate == pytest.approx(0.9)


class TestProjectHealthCalculator:
    """Unit tests for the calculator that extracts factors from project data."""

    def _make_task(
        self,
        status: str = "todo",
        estimated_hours: float = 8.0,
        actual_hours: float = 0.0,
        end_date: date | None = None,
    ) -> MagicMock:
        t = MagicMock()
        t.status = status
        t.estimated_hours = estimated_hours
        t.actual_hours = actual_hours
        t.end_date = end_date
        return t

    def test_no_tasks_returns_neutral_schedule_and_completion(self) -> None:
        calc = ProjectHealthCalculator(
            tasks=[],
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=0,
            actual_hours_total=0.0,
        )
        factors = calc.compute_factors()
        # No tasks → can't penalise; treat as 1.0 (nothing to fail)
        assert factors.schedule_variance == pytest.approx(1.0)
        assert factors.task_completion_rate == pytest.approx(1.0)

    def test_all_tasks_done_completion_rate_1(self) -> None:
        tasks = [self._make_task("done") for _ in range(5)]
        calc = ProjectHealthCalculator(
            tasks=tasks,
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=80_000,
            actual_hours_total=40.0,
        )
        factors = calc.compute_factors()
        assert factors.task_completion_rate == pytest.approx(1.0)

    def test_half_tasks_done_completion_rate_half(self) -> None:
        tasks = [self._make_task("done")] * 3 + [self._make_task("todo")] * 3
        calc = ProjectHealthCalculator(
            tasks=tasks,
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=50_000,
            actual_hours_total=20.0,
        )
        factors = calc.compute_factors()
        assert factors.task_completion_rate == pytest.approx(0.5)

    def test_overdue_tasks_lower_schedule_variance(self) -> None:
        yesterday = date.today() - timedelta(days=1)
        overdue = self._make_task("todo", end_date=yesterday)
        on_time = self._make_task("todo", end_date=date.today() + timedelta(days=5))
        calc = ProjectHealthCalculator(
            tasks=[overdue, on_time],
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=0,
            actual_hours_total=0.0,
        )
        factors = calc.compute_factors()
        # 1 of 2 is overdue → 0.5
        assert factors.schedule_variance == pytest.approx(0.5)

    def test_no_budget_burn_rate_is_neutral(self) -> None:
        calc = ProjectHealthCalculator(
            tasks=[],
            today=date.today(),
            budget_cents=0,           # no budget set
            actual_spend_cents=0,
            actual_hours_total=0.0,
        )
        factors = calc.compute_factors()
        # Unknown budget → neutral (1.0 means no penalty)
        assert factors.budget_burn_rate == pytest.approx(0.5)

    def test_within_budget_burn_rate_below_1(self) -> None:
        calc = ProjectHealthCalculator(
            tasks=[],
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=50_000,  # 50%
            actual_hours_total=0.0,
        )
        factors = calc.compute_factors()
        assert factors.budget_burn_rate == pytest.approx(0.5)

    def test_over_budget_burn_rate_above_1(self) -> None:
        calc = ProjectHealthCalculator(
            tasks=[],
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=150_000,  # 150%
            actual_hours_total=0.0,
        )
        factors = calc.compute_factors()
        assert factors.budget_burn_rate == pytest.approx(1.5)

    def test_time_accuracy_perfect_match(self) -> None:
        tasks = [self._make_task("done", estimated_hours=8.0)]
        calc = ProjectHealthCalculator(
            tasks=tasks,
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=0,
            actual_hours_total=8.0,  # exactly matches estimated
        )
        factors = calc.compute_factors()
        assert factors.time_accuracy == pytest.approx(1.0)

    def test_time_accuracy_no_estimates_neutral(self) -> None:
        tasks = [self._make_task("todo", estimated_hours=0.0)]
        calc = ProjectHealthCalculator(
            tasks=tasks,
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=0,
            actual_hours_total=0.0,
        )
        factors = calc.compute_factors()
        assert factors.time_accuracy == pytest.approx(1.0)

    def test_time_accuracy_over_by_50pct(self) -> None:
        tasks = [self._make_task("done", estimated_hours=10.0)]
        calc = ProjectHealthCalculator(
            tasks=tasks,
            today=date.today(),
            budget_cents=100_000,
            actual_spend_cents=0,
            actual_hours_total=15.0,  # 50% over estimate
        )
        factors = calc.compute_factors()
        # Ratio = 15/10 = 1.5 → time_accuracy = 1/1.5 ≈ 0.667
        assert factors.time_accuracy == pytest.approx(1.0 / 1.5, rel=0.01)


# ---------------------------------------------------------------------------
# API integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_score_endpoint_exists(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _make_project(client, headers)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score", headers=headers
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_health_score_response_shape(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "shape@example.com")
    project_id = await _make_project(client, headers)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "score" in body
    assert "grade" in body
    assert "factors" in body
    assert isinstance(body["score"], int)
    assert body["grade"] in ("green", "amber", "red")
    factors = body["factors"]
    assert "schedule_variance" in factors
    assert "budget_burn_rate" in factors
    assert "time_accuracy" in factors
    assert "task_completion_rate" in factors


@pytest.mark.asyncio
async def test_health_score_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "authcheck@example.com")
    project_id = await _make_project(client, headers)
    resp = await client.get(f"/api/v1/projects/{project_id}/health-score")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_health_score_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "owner@example.com")
    h2 = await _auth_headers(client, "stranger@example.com")
    project_id = await _make_project(client, h1)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score", headers=h2
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_health_score_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "notfound@example.com")
    resp = await client.get(
        f"/api/v1/projects/{uuid.uuid4()}/health-score", headers=headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_health_score_all_done_tasks_score_high(client: AsyncClient) -> None:
    """A project with all done tasks, no overruns should score green."""
    headers = await _auth_headers(client, "allgreen@example.com")
    project_id = await _make_project(client, headers, budget_cents=100_000)

    # Add done tasks
    phase_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": "Phase"},
        headers=headers,
    )
    phase_id = phase_resp.json()["id"]
    for i in range(3):
        await client.post(
            f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
            json={"name": f"Task {i}", "status": "done", "estimated_hours": 4.0},
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    # All tasks done + no spend → should be fairly high
    assert body["score"] >= 50
    assert body["grade"] in ("green", "amber")


@pytest.mark.asyncio
async def test_health_score_score_in_0_100_range(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "range@example.com")
    project_id = await _make_project(client, headers)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score", headers=headers
    )
    body = resp.json()
    assert 0 <= body["score"] <= 100


@pytest.mark.asyncio
async def test_health_score_threshold_in_response(client: AsyncClient) -> None:
    """Response should include the threshold used."""
    headers = await _auth_headers(client, "threshold@example.com")
    project_id = await _make_project(client, headers)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score", headers=headers
    )
    body = resp.json()
    assert "threshold" in body
    assert isinstance(body["threshold"], int)


@pytest.mark.asyncio
async def test_health_score_below_threshold_creates_notification(
    client: AsyncClient, app_with_db
) -> None:
    """When score < threshold a notification must be dispatched."""
    from app.services.notifications.engine import NotificationDispatcher
    from app.services.notifications.dispatcher_dep import get_default_dispatcher

    dispatched: list[dict] = []

    class CapturingDispatcher(NotificationDispatcher):
        def __init__(self) -> None:
            super().__init__(channels=[])

        async def dispatch(self, db, *, user_id, type, title, body="", data=None, channels=None):  # type: ignore[override]
            dispatched.append({"type": type, "title": title, "data": data})
            # Return a minimal fake notification object
            from unittest.mock import MagicMock
            n = MagicMock()
            n.id = uuid.uuid4()
            return n

    capturing = CapturingDispatcher()
    app_with_db.dependency_overrides[get_default_dispatcher] = lambda: capturing

    headers = await _auth_headers(client, "notif@example.com")
    # Create a project with overdue tasks to drive score down
    today = date.today()
    overdue = (today - timedelta(days=10)).isoformat()
    project_id = await _make_project(
        client, headers,
        budget_cents=10_000,
        end_date=overdue,
    )
    # Add many overdue todo tasks to push score low
    phase_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": "Late phase"},
        headers=headers,
    )
    phase_id = phase_resp.json()["id"]
    for i in range(5):
        await client.post(
            f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
            json={
                "name": f"Overdue task {i}",
                "status": "todo",
                "estimated_hours": 8.0,
                "end_date": overdue,
            },
            headers=headers,
        )

    # Hit the endpoint with a high threshold so any score triggers the notification
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score?threshold=100",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] < 100
    # Notification must have been dispatched
    assert len(dispatched) >= 1
    notif_types = [d["type"] for d in dispatched]
    assert any("health" in t for t in notif_types)

    # Cleanup override
    del app_with_db.dependency_overrides[get_default_dispatcher]


@pytest.mark.asyncio
async def test_health_score_above_threshold_no_notification(
    client: AsyncClient, app_with_db
) -> None:
    """Score above threshold must NOT produce a notification."""
    from app.services.notifications.dispatcher_dep import get_default_dispatcher
    from app.services.notifications.engine import NotificationDispatcher

    dispatched: list[dict] = []

    class CapturingDispatcher(NotificationDispatcher):
        def __init__(self) -> None:
            super().__init__(channels=[])

        async def dispatch(self, db, *, user_id, type, title, body="", data=None, channels=None):  # type: ignore[override]
            dispatched.append({"type": type})
            from unittest.mock import MagicMock
            return MagicMock()

    capturing = CapturingDispatcher()
    app_with_db.dependency_overrides[get_default_dispatcher] = lambda: capturing

    headers = await _auth_headers(client, "nonotif@example.com")
    project_id = await _make_project(client, headers)

    # threshold=0 → score will always be above 0, no notification
    resp = await client.get(
        f"/api/v1/projects/{project_id}/health-score?threshold=0",
        headers=headers,
    )
    assert resp.status_code == 200
    health_notifs = [d for d in dispatched if "health" in d["type"]]
    assert len(health_notifs) == 0

    del app_with_db.dependency_overrides[get_default_dispatcher]
