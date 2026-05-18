"""Tests for AI-driven anomaly detection + dispatch.

Anomaly types covered:
- over_budget: spent_cents > project.budget_cents
- behind_schedule: today > project.end_date and status != "completed"
- weather_risk: forecast contains severe condition during active project window

Design:
- `AnomalyDetector(reasoner)` exposes deterministic rule methods returning
  `Anomaly` objects (or empty list).
- A `Reasoner` interface produces a human-readable `reasoning` string. The
  default `FakeReasoner` is fully deterministic so tests don't need an LLM.
- `scan_project()` runs all rules for one project + context.
- `scan_and_dispatch()` runs the scan and dispatches notifications via the
  existing `NotificationDispatcher`.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.notification import Notification
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.services.notifications.anomaly import (
    Anomaly,
    AnomalyDetector,
    FakeReasoner,
    ProjectContext,
    Reasoner,
)
from app.services.notifications.channels import InAppChannel
from app.services.notifications.engine import NotificationDispatcher

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, expire_on_commit=False)
    yield sf
    await engine.dispose()


async def _seed_user_and_project(
    sf,
    *,
    budget_cents: int = 100_000,
    start: date | None = None,
    end: date | None = None,
    status: str = "active",
) -> tuple[uuid.UUID, Project]:
    async with sf() as db:
        user = User(email="o@o.o", name="O", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        project = Project(
            owner_id=user.id,
            name="House",
            budget_cents=budget_cents,
            start_date=start,
            end_date=end,
            status=status,
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
        return user.id, project


# ---------------------------------------------------------------------------
# Reasoner interface
# ---------------------------------------------------------------------------


def test_reasoner_is_abstract() -> None:
    with pytest.raises(TypeError):
        Reasoner()  # type: ignore[abstract]


def test_fake_reasoner_returns_deterministic_string() -> None:
    r = FakeReasoner()
    out = r.explain(
        anomaly_type="over_budget",
        facts={"project": "House", "overrun_cents": 5000},
    )
    assert isinstance(out, str)
    assert "over_budget" in out
    assert "House" in out


def test_fake_reasoner_is_stable_for_same_input() -> None:
    r = FakeReasoner()
    a = r.explain(anomaly_type="behind_schedule", facts={"days": 3})
    b = r.explain(anomaly_type="behind_schedule", facts={"days": 3})
    assert a == b


# ---------------------------------------------------------------------------
# Deterministic rules
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detects_over_budget(session_factory) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory, budget_cents=100_000
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=120_000, today=date(2026, 6, 1))
    anomalies = detector.scan_project(project, ctx)
    types = [a.type for a in anomalies]
    assert "alert.over_budget" in types
    over = next(a for a in anomalies if a.type == "alert.over_budget")
    assert over.severity == "high"
    assert over.facts["overrun_cents"] == 20_000
    assert over.reasoning  # populated


@pytest.mark.asyncio
async def test_no_over_budget_when_under(session_factory) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory, budget_cents=100_000
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=80_000, today=date(2026, 6, 1))
    anomalies = detector.scan_project(project, ctx)
    assert all(a.type != "alert.over_budget" for a in anomalies)


@pytest.mark.asyncio
async def test_detects_behind_schedule(session_factory) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory,
        end=date(2026, 1, 1),
        status="active",
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=0, today=date(2026, 2, 15))
    anomalies = detector.scan_project(project, ctx)
    types = [a.type for a in anomalies]
    assert "alert.behind_schedule" in types
    a = next(a for a in anomalies if a.type == "alert.behind_schedule")
    assert a.facts["days_overdue"] == 45


@pytest.mark.asyncio
async def test_no_behind_schedule_when_completed(session_factory) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory,
        end=date(2026, 1, 1),
        status="completed",
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=0, today=date(2026, 2, 15))
    anomalies = detector.scan_project(project, ctx)
    assert all(a.type != "alert.behind_schedule" for a in anomalies)


@pytest.mark.asyncio
async def test_no_behind_schedule_when_no_end_date(session_factory) -> None:
    _uid, project = await _seed_user_and_project(session_factory, end=None)
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=0, today=date(2026, 2, 15))
    anomalies = detector.scan_project(project, ctx)
    assert all(a.type != "alert.behind_schedule" for a in anomalies)


@pytest.mark.asyncio
async def test_detects_weather_risk(session_factory) -> None:
    today = date(2026, 6, 1)
    _uid, project = await _seed_user_and_project(
        session_factory, start=today, end=today + timedelta(days=10)
    )
    forecast = [
        {"date": today.isoformat(), "condition": "clear", "wind_kmh": 10},
        {"date": (today + timedelta(days=1)).isoformat(), "condition": "storm", "wind_kmh": 80},
    ]
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=0, today=today, weather_forecast=forecast)
    anomalies = detector.scan_project(project, ctx)
    types = [a.type for a in anomalies]
    assert "alert.weather_risk" in types
    risk = next(a for a in anomalies if a.type == "alert.weather_risk")
    # Severe day surfaced in facts
    assert risk.facts["severe_days"]
    assert risk.facts["severe_days"][0]["condition"] == "storm"


@pytest.mark.asyncio
async def test_weather_risk_ignores_forecast_outside_project_window(
    session_factory,
) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory,
        start=date(2026, 6, 1),
        end=date(2026, 6, 5),
    )
    forecast = [
        {"date": "2026-07-01", "condition": "storm", "wind_kmh": 80},
    ]
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=0, today=date(2026, 6, 2), weather_forecast=forecast)
    anomalies = detector.scan_project(project, ctx)
    assert all(a.type != "alert.weather_risk" for a in anomalies)


@pytest.mark.asyncio
async def test_no_weather_risk_when_no_forecast(session_factory) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory,
        start=date(2026, 6, 1),
        end=date(2026, 6, 10),
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    ctx = ProjectContext(spent_cents=0, today=date(2026, 6, 2), weather_forecast=None)
    anomalies = detector.scan_project(project, ctx)
    assert all(a.type != "alert.weather_risk" for a in anomalies)


@pytest.mark.asyncio
async def test_anomalies_carry_human_readable_reasoning(session_factory) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory, budget_cents=100_000
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    anomalies = detector.scan_project(
        project, ProjectContext(spent_cents=110_000, today=date(2026, 6, 1))
    )
    for a in anomalies:
        assert isinstance(a.reasoning, str)
        assert a.reasoning.strip()


# ---------------------------------------------------------------------------
# Dispatch integration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scan_and_dispatch_creates_one_notification_per_anomaly(
    session_factory,
) -> None:
    uid, project = await _seed_user_and_project(
        session_factory,
        budget_cents=100_000,
        start=date(2026, 6, 1),
        end=date(2026, 1, 1),  # already past
        status="active",
    )
    forecast = [{"date": "2026-06-02", "condition": "storm", "wind_kmh": 90}]
    detector = AnomalyDetector(reasoner=FakeReasoner())
    dispatcher = NotificationDispatcher(channels=[InAppChannel()])

    async with session_factory() as db:
        # Need to re-fetch project in this session
        from sqlalchemy import select as _sel

        proj = (
            await db.execute(_sel(Project).where(Project.id == project.id))
        ).scalar_one()
        sent = await detector.scan_and_dispatch(
            db,
            dispatcher=dispatcher,
            project=proj,
            recipient_user_id=uid,
            context=ProjectContext(
                spent_cents=200_000,
                today=date(2026, 6, 2),
                weather_forecast=forecast,
            ),
        )

    assert len(sent) == 3
    types = sorted(n.type for n in sent)
    assert types == [
        "alert.behind_schedule",
        "alert.over_budget",
        "alert.weather_risk",
    ]

    async with session_factory() as db:
        rows = (await db.execute(select(Notification))).scalars().all()
        assert len(rows) == 3
        for n in rows:
            assert n.body  # has reasoning
            assert "in_app" in n.channels_dispatched


@pytest.mark.asyncio
async def test_scan_and_dispatch_no_anomalies_dispatches_nothing(
    session_factory,
) -> None:
    uid, project = await _seed_user_and_project(
        session_factory,
        budget_cents=1_000_000,
        end=date(2030, 1, 1),
        status="active",
    )
    detector = AnomalyDetector(reasoner=FakeReasoner())
    dispatcher = NotificationDispatcher(channels=[InAppChannel()])

    async with session_factory() as db:
        proj = (
            await db.execute(select(Project).where(Project.id == project.id))
        ).scalar_one()
        sent = await detector.scan_and_dispatch(
            db,
            dispatcher=dispatcher,
            project=proj,
            recipient_user_id=uid,
            context=ProjectContext(spent_cents=10_000, today=date(2026, 6, 1)),
        )

    assert sent == []
    async with session_factory() as db:
        rows = (await db.execute(select(Notification))).scalars().all()
        assert rows == []


# ---------------------------------------------------------------------------
# Scheduled job hook
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_scheduled_scan_processes_all_active_projects(
    session_factory,
) -> None:
    from app.services.notifications.anomaly import run_scheduled_scan

    # User + two projects (one active over budget, one archived ignored)
    async with session_factory() as db:
        user = User(email="o@o.o", name="O", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        p_active = Project(
            owner_id=user.id,
            name="A",
            status="active",
            budget_cents=10_000,
        )
        p_archived = Project(
            owner_id=user.id,
            name="B",
            status="archived",
            budget_cents=10_000,
        )
        db.add_all([p_active, p_archived])
        await db.commit()

    detector = AnomalyDetector(reasoner=FakeReasoner())
    dispatcher = NotificationDispatcher(channels=[InAppChannel()])

    async with session_factory() as db:
        context_provider = lambda project: ProjectContext(  # noqa: E731
            spent_cents=50_000, today=date(2026, 6, 1)
        )
        results = await run_scheduled_scan(
            db,
            detector=detector,
            dispatcher=dispatcher,
            context_provider=context_provider,
        )

    # Only the active project produced anomalies
    assert len(results) == 1
    assert results[0]["project_name"] == "A"
    assert any(n.type == "alert.over_budget" for n in results[0]["notifications"])

    async with session_factory() as db:
        rows = (await db.execute(select(Notification))).scalars().all()
        # Only over_budget for the active project
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# LLM reasoner contract — a Fake captures call shape
# ---------------------------------------------------------------------------


class CapturingReasoner(Reasoner):
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def explain(self, *, anomaly_type: str, facts: dict) -> str:
        self.calls.append((anomaly_type, facts))
        return f"LLM says: {anomaly_type} bad ({facts})"


@pytest.mark.asyncio
async def test_detector_routes_through_reasoner_interface(
    session_factory,
) -> None:
    _uid, project = await _seed_user_and_project(
        session_factory, budget_cents=100, end=date(2026, 1, 1), status="active"
    )
    cap = CapturingReasoner()
    detector = AnomalyDetector(reasoner=cap)
    anomalies = detector.scan_project(
        project,
        ProjectContext(spent_cents=200, today=date(2026, 2, 1)),
    )
    assert len(cap.calls) == len(anomalies)
    assert all(a.reasoning.startswith("LLM says:") for a in anomalies)
