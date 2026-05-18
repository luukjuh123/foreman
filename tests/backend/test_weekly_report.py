"""Tests for the weekly project report generator."""

import uuid
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.services.reports.weekly import generate_weekly_report


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


async def _seed(s) -> Project:
    user = User(email="o@example.com", name="O", hashed_password="x")
    s.add(user)
    await s.flush()
    project = Project(
        owner_id=user.id, name="Casa", status="active", budget_cents=500_000,
    )
    s.add(project)
    await s.flush()
    foundation = Phase(
        project_id=project.id, name="Foundation", status="in_progress", order_index=0
    )
    framing = Phase(project_id=project.id, name="Framing", status="pending", order_index=1)
    s.add_all([foundation, framing])
    await s.flush()

    # Week of Mon 2025-02-03 .. Sun 2025-02-09
    s.add(Task(
        phase_id=foundation.id, name="Dig", status="done",
        estimated_hours=8.0, labor_cost_cents=40_000,
        start_date=date(2025, 2, 3), end_date=date(2025, 2, 4),
    ))
    s.add(Task(
        phase_id=foundation.id, name="Pour", status="done",
        estimated_hours=12.0, labor_cost_cents=72_000,
        start_date=date(2025, 2, 5), end_date=date(2025, 2, 6),
    ))
    s.add(Task(
        phase_id=foundation.id, name="Cure", status="in_progress",
        estimated_hours=4.0, labor_cost_cents=20_000,
        start_date=date(2025, 2, 7), end_date=date(2025, 2, 9),
    ))
    # Next week
    s.add(Task(
        phase_id=framing.id, name="Walls", status="todo",
        estimated_hours=20.0, labor_cost_cents=100_000,
        start_date=date(2025, 2, 10), end_date=date(2025, 2, 14),
    ))
    s.add(Task(
        phase_id=framing.id, name="Roof", status="todo",
        estimated_hours=16.0, labor_cost_cents=80_000,
        start_date=date(2025, 2, 12), end_date=date(2025, 2, 16),
    ))
    # Prior week — excluded
    s.add(Task(
        phase_id=foundation.id, name="Survey", status="done",
        estimated_hours=4.0, labor_cost_cents=20_000,
        start_date=date(2025, 1, 27), end_date=date(2025, 1, 28),
    ))
    await s.commit()
    return project


@pytest.mark.asyncio
async def test_weekly_report_has_correct_period(session) -> None:
    project = await _seed(session)
    rep = await generate_weekly_report(session, project.id, date(2025, 2, 3))
    assert rep["type"] == "weekly"
    assert rep["period"]["start"] == "2025-02-03"
    assert rep["period"]["end"] == "2025-02-09"


@pytest.mark.asyncio
async def test_weekly_report_rejects_non_monday(session) -> None:
    project = await _seed(session)
    # 2025-02-05 is a Wednesday
    with pytest.raises(ValueError):
        await generate_weekly_report(session, project.id, date(2025, 2, 5))


@pytest.mark.asyncio
async def test_weekly_report_aggregates_this_week_only(session) -> None:
    project = await _seed(session)
    rep = await generate_weekly_report(session, project.id, date(2025, 2, 3))
    # 3 tasks in [2025-02-03, 2025-02-09]
    assert rep["totals"]["task_count"] == 3
    assert rep["totals"]["estimated_hours"] == pytest.approx(24.0)
    assert rep["totals"]["labor_cost_cents"] == 132_000


@pytest.mark.asyncio
async def test_weekly_report_completed_this_week(session) -> None:
    project = await _seed(session)
    rep = await generate_weekly_report(session, project.id, date(2025, 2, 3))
    completed = {t["name"] for t in rep["completed_this_week"]}
    assert completed == {"Dig", "Pour"}


@pytest.mark.asyncio
async def test_weekly_report_next_week_plan(session) -> None:
    project = await _seed(session)
    rep = await generate_weekly_report(session, project.id, date(2025, 2, 3))
    next_week = {t["name"] for t in rep["next_week_plan"]}
    # "Roof" overlaps next week (Feb 12-16) and "Walls" too (Feb 10-14).
    # "Cure" extends to 2025-02-09 only — not in next week.
    assert next_week == {"Walls", "Roof"}


@pytest.mark.asyncio
async def test_weekly_report_hours_by_phase(session) -> None:
    project = await _seed(session)
    rep = await generate_weekly_report(session, project.id, date(2025, 2, 3))
    by_phase = {row["phase_name"]: row for row in rep["hours_by_phase"]}
    assert by_phase["Foundation"]["estimated_hours"] == pytest.approx(24.0)
    assert by_phase["Foundation"]["labor_cost_cents"] == 132_000
    # No Foundation-only week — phases with zero tasks omitted
    assert "Framing" not in by_phase


@pytest.mark.asyncio
async def test_weekly_report_photos_field_present(session) -> None:
    project = await _seed(session)
    rep = await generate_weekly_report(session, project.id, date(2025, 2, 3))
    # Photo model not yet implemented — must still expose the slot for the
    # frontend / PDF template, defaulting to an empty list.
    assert rep["photos"] == []


@pytest.mark.asyncio
async def test_weekly_report_unknown_project(session) -> None:
    with pytest.raises(LookupError):
        await generate_weekly_report(session, uuid.uuid4(), date(2025, 2, 3))
