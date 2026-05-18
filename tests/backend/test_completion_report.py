"""Tests for the project completion report generator."""

import uuid
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.services.reports.completion import generate_completion_report


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s
    await engine.dispose()


async def _seed(s, *, budget_cents: int = 1_000_000) -> Project:
    user = User(email="o@example.com", name="O", hashed_password="x")
    s.add(user)
    await s.flush()
    project = Project(
        owner_id=user.id, name="Casa", status="completed", budget_cents=budget_cents,
        start_date=date(2025, 1, 1), end_date=date(2025, 3, 31),
    )
    s.add(project)
    await s.flush()
    foundation = Phase(
        project_id=project.id, name="Foundation", status="done", order_index=0
    )
    framing = Phase(project_id=project.id, name="Framing", status="done", order_index=1)
    s.add_all([foundation, framing])
    await s.flush()
    s.add_all([
        Task(phase_id=foundation.id, name="Dig", status="done",
             estimated_hours=8.0, labor_cost_cents=40_000,
             start_date=date(2025, 1, 5), end_date=date(2025, 1, 6)),
        Task(phase_id=foundation.id, name="Pour", status="done",
             estimated_hours=12.0, labor_cost_cents=72_000,
             start_date=date(2025, 1, 7), end_date=date(2025, 1, 10)),
        Task(phase_id=framing.id, name="Walls", status="done",
             estimated_hours=20.0, labor_cost_cents=100_000,
             start_date=date(2025, 2, 1), end_date=date(2025, 2, 10)),
        Task(phase_id=framing.id, name="Punch", status="blocked",
             estimated_hours=4.0, labor_cost_cents=20_000,
             start_date=date(2025, 3, 20), end_date=date(2025, 3, 25)),
    ])
    await s.commit()
    return project


@pytest.mark.asyncio
async def test_completion_report_type_and_project(session) -> None:
    project = await _seed(session)
    rep = await generate_completion_report(session, project.id)
    assert rep["type"] == "completion"
    assert rep["project"]["name"] == "Casa"
    assert rep["project"]["status"] == "completed"


@pytest.mark.asyncio
async def test_completion_report_timeline(session) -> None:
    project = await _seed(session)
    rep = await generate_completion_report(session, project.id)
    tl = rep["timeline"]
    assert tl["planned_start"] == "2025-01-01"
    assert tl["planned_end"] == "2025-03-31"
    # Earliest task start, latest task end
    assert tl["actual_start"] == "2025-01-05"
    assert tl["actual_end"] == "2025-03-25"
    assert tl["planned_duration_days"] == 90  # Jan 1 -> Mar 31 inclusive
    assert tl["actual_duration_days"] == 80  # 2025-01-05 -> 2025-03-25


@pytest.mark.asyncio
async def test_completion_report_costs_vs_budget(session) -> None:
    project = await _seed(session)
    rep = await generate_completion_report(session, project.id)
    cb = rep["costs_vs_budget"]
    assert cb["budget_cents"] == 1_000_000
    assert cb["actual_cost_cents"] == 232_000
    assert cb["variance_cents"] == 1_000_000 - 232_000
    assert cb["variance_pct"] == pytest.approx((232_000 - 1_000_000) / 1_000_000 * 100)
    assert cb["over_budget"] is False


@pytest.mark.asyncio
async def test_completion_report_over_budget_flag(session) -> None:
    project = await _seed(session, budget_cents=100_000)
    rep = await generate_completion_report(session, project.id)
    cb = rep["costs_vs_budget"]
    assert cb["actual_cost_cents"] == 232_000
    assert cb["over_budget"] is True
    assert cb["variance_cents"] == 100_000 - 232_000


@pytest.mark.asyncio
async def test_completion_report_zero_budget_handled(session) -> None:
    project = await _seed(session, budget_cents=0)
    rep = await generate_completion_report(session, project.id)
    cb = rep["costs_vs_budget"]
    assert cb["budget_cents"] == 0
    assert cb["variance_pct"] is None  # cannot divide by zero — explicit None


@pytest.mark.asyncio
async def test_completion_report_phase_summary(session) -> None:
    project = await _seed(session)
    rep = await generate_completion_report(session, project.id)
    summary = {row["phase_name"]: row for row in rep["phase_summary"]}
    assert summary["Foundation"]["task_count"] == 2
    assert summary["Foundation"]["completed_task_count"] == 2
    assert summary["Foundation"]["actual_cost_cents"] == 112_000
    assert summary["Foundation"]["estimated_hours"] == pytest.approx(20.0)
    assert summary["Framing"]["task_count"] == 2
    assert summary["Framing"]["completed_task_count"] == 1


@pytest.mark.asyncio
async def test_completion_report_lessons_and_photos_slots(session) -> None:
    project = await _seed(session)
    rep = await generate_completion_report(session, project.id)
    # Free-text lessons/photos aren't modelled yet — slots reserved for the
    # frontend / PDF template so it can render unconditionally.
    assert rep["lessons_learned"] == []
    assert rep["photos"] == []


@pytest.mark.asyncio
async def test_completion_report_unknown_project(session) -> None:
    with pytest.raises(LookupError):
        await generate_completion_report(session, uuid.uuid4())
