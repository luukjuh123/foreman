"""Tests for the report aggregation engine."""

import uuid
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.services.reports.engine import aggregate_project_data


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


async def _seed_project(s) -> Project:
    user = User(email="o@example.com", name="O", hashed_password="x")
    s.add(user)
    await s.flush()
    project = Project(
        owner_id=user.id,
        name="Casa",
        status="active",
        budget_cents=1_000_000,
        start_date=date(2025, 1, 1),
        end_date=date(2025, 6, 1),
    )
    s.add(project)
    await s.flush()
    phase = Phase(project_id=project.id, name="Foundation", status="in_progress", order_index=0)
    s.add(phase)
    await s.flush()
    s.add(Task(
        phase_id=phase.id, name="Dig", status="done",
        estimated_hours=8.0, labor_cost_cents=40_000,
        start_date=date(2025, 2, 3), end_date=date(2025, 2, 4),
    ))
    s.add(Task(
        phase_id=phase.id, name="Pour", status="in_progress",
        estimated_hours=12.0, labor_cost_cents=72_000,
        start_date=date(2025, 2, 6), end_date=date(2025, 2, 7),
    ))
    s.add(Task(
        phase_id=phase.id, name="Survey", status="done",
        estimated_hours=4.0, labor_cost_cents=20_000,
        start_date=date(2025, 1, 5), end_date=date(2025, 1, 6),
    ))
    await s.commit()
    return project


@pytest.mark.asyncio
async def test_aggregate_returns_project_summary(session) -> None:
    project = await _seed_project(session)
    data = await aggregate_project_data(session, project.id)
    assert data["project"]["name"] == "Casa"
    assert data["project"]["budget_cents"] == 1_000_000
    assert data["project"]["status"] == "active"
    assert len(data["phases"]) == 1
    assert data["phases"][0]["name"] == "Foundation"


@pytest.mark.asyncio
async def test_aggregate_totals_hours_and_costs(session) -> None:
    project = await _seed_project(session)
    data = await aggregate_project_data(session, project.id)
    assert data["totals"]["task_count"] == 3
    assert data["totals"]["completed_task_count"] == 2
    assert data["totals"]["estimated_hours"] == pytest.approx(24.0)
    assert data["totals"]["labor_cost_cents"] == 132_000


@pytest.mark.asyncio
async def test_aggregate_filters_by_period(session) -> None:
    project = await _seed_project(session)
    data = await aggregate_project_data(
        session, project.id,
        period_start=date(2025, 2, 1), period_end=date(2025, 2, 28),
    )
    assert data["totals"]["task_count"] == 2
    assert data["totals"]["estimated_hours"] == pytest.approx(20.0)
    assert data["totals"]["labor_cost_cents"] == 112_000
    assert data["period"]["start"] == "2025-02-01"
    assert data["period"]["end"] == "2025-02-28"
    names = {t["name"] for t in data["tasks"]}
    assert names == {"Dig", "Pour"}


@pytest.mark.asyncio
async def test_aggregate_raises_for_unknown_project(session) -> None:
    with pytest.raises(LookupError):
        await aggregate_project_data(session, uuid.uuid4())
