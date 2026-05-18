"""Tests for AI auto-fill planning endpoints and service."""

import uuid
from datetime import date

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
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
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


async def _register_and_token(client: AsyncClient, email: str = "user@example.com") -> str:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    return resp.json()["access_token"]


async def _auth_headers(client: AsyncClient, email: str = "user@example.com") -> dict:
    token = await _register_and_token(client, email)
    return {"Authorization": f"Bearer {token}"}


async def _create_project_with_tasks(client: AsyncClient, headers: dict) -> tuple[str, str, list[str]]:
    """Create a project with one phase and two tasks (task2 depends on task1). Returns (project_id, phase_id, [task1_id, task2_id])."""
    proj = await client.post("/api/v1/projects/", json={"name": "Build Project"}, headers=headers)
    project_id = proj.json()["id"]

    phase_resp = await client.post(f"/api/v1/projects/{project_id}/phases", json={"name": "Foundation"}, headers=headers)
    phase_id = phase_resp.json()["id"]

    t1 = await client.post(f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks", json={
        "name": "Excavation",
        "estimated_hours": 16.0,
    }, headers=headers)
    task1_id = t1.json()["id"]

    t2 = await client.post(f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks", json={
        "name": "Pour Foundation",
        "estimated_hours": 8.0,
    }, headers=headers)
    task2_id = t2.json()["id"]

    # task2 depends on task1
    await client.post(
        f"/api/v1/projects/{project_id}/tasks/{task2_id}/dependencies",
        json={"depends_on_task_id": task1_id},
        headers=headers,
    )

    return project_id, phase_id, [task1_id, task2_id]


# ---------------------------------------------------------------------------
# Schemas (unit-level)
# ---------------------------------------------------------------------------

def test_autofill_request_defaults():
    from app.schemas.planning import AutofillRequest
    req = AutofillRequest(project_id=uuid.uuid4())
    assert req.working_hours_per_day == 8
    assert req.start_date is None


def test_autofill_response_structure():
    from app.schemas.planning import AutofillResponse, TaskScheduleProposal
    proposal = TaskScheduleProposal(
        task_id=uuid.uuid4(),
        proposed_start_date=date(2026, 1, 1),
        proposed_end_date=date(2026, 1, 3),
        reasoning="Scheduled after dependency.",
        is_critical=True,
    )
    resp = AutofillResponse(proposals=[proposal])
    assert len(resp.proposals) == 1
    assert resp.proposals[0].is_critical is True


def test_apply_schedule_request_structure():
    from app.schemas.planning import ApplyScheduleRequest
    req = ApplyScheduleRequest(project_id=uuid.uuid4(), task_ids=[uuid.uuid4(), uuid.uuid4()])
    assert len(req.task_ids) == 2


# ---------------------------------------------------------------------------
# CPM integration (pure function)
# ---------------------------------------------------------------------------

def test_autofill_service_compute_schedule_simple():
    """Service computes correct start/end dates for a linear chain."""
    from app.services.planning.autofill import compute_schedule
    from app.services.planning.cpm import CpmTask

    tasks = [
        CpmTask(id="t1", name="Excavation", duration_hours=16.0),
        CpmTask(id="t2", name="Pour Foundation", duration_hours=8.0, dependencies=["t1"]),
    ]
    start = date(2026, 1, 5)  # Monday
    proposals = compute_schedule(tasks, start_date=start, working_hours_per_day=8)

    assert len(proposals) == 2
    p1 = next(p for p in proposals if p.task_id == "t1")
    p2 = next(p for p in proposals if p.task_id == "t2")

    # t1: 16h / 8h per day = 2 days → starts Jan 5, ends Jan 6
    assert p1.proposed_start_date == date(2026, 1, 5)
    assert p1.proposed_end_date == date(2026, 1, 6)
    assert p1.is_critical is True

    # t2: starts after t1 ends → Jan 7, runs 1 day (8h) → ends Jan 7
    assert p2.proposed_start_date == date(2026, 1, 7)
    assert p2.proposed_end_date == date(2026, 1, 7)
    assert p2.is_critical is True


def test_autofill_service_non_critical_task():
    """Task with float is not marked critical."""
    from app.services.planning.autofill import compute_schedule
    from app.services.planning.cpm import CpmTask

    # t1 and t2 run in parallel, then t3 waits for both.
    # t1=8h, t2=16h → t1 has float=8h, t2 is critical.
    tasks = [
        CpmTask(id="t1", name="Short Task", duration_hours=8.0),
        CpmTask(id="t2", name="Long Task", duration_hours=16.0),
        CpmTask(id="t3", name="Finishing", duration_hours=4.0, dependencies=["t1", "t2"]),
    ]
    start = date(2026, 1, 5)
    proposals = compute_schedule(tasks, start_date=start, working_hours_per_day=8)

    p1 = next(p for p in proposals if p.task_id == "t1")
    p2 = next(p for p in proposals if p.task_id == "t2")
    assert p1.is_critical is False
    assert p2.is_critical is True


def test_compute_schedule_reasoning_non_empty():
    """Every proposal must have a non-empty reasoning string."""
    from app.services.planning.autofill import compute_schedule
    from app.services.planning.cpm import CpmTask

    tasks = [CpmTask(id="t1", name="Task A", duration_hours=4.0)]
    proposals = compute_schedule(tasks, start_date=date(2026, 1, 1), working_hours_per_day=8)
    assert proposals[0].reasoning != ""


def test_compute_schedule_zero_hours_uses_default():
    """Task with 0 estimated_hours gets a fallback duration of 8h (1 day)."""
    from app.services.planning.autofill import compute_schedule
    from app.services.planning.cpm import CpmTask

    tasks = [CpmTask(id="t1", name="Unknown Task", duration_hours=0.0)]
    proposals = compute_schedule(tasks, start_date=date(2026, 1, 5), working_hours_per_day=8)
    # Should produce a valid schedule (not zero-length)
    p = proposals[0]
    assert p.proposed_end_date >= p.proposed_start_date
    assert "default" in p.reasoning.lower() or "historical" in p.reasoning.lower() or "estimated" in p.reasoning.lower()


# ---------------------------------------------------------------------------
# POST /api/v1/planning/autofill endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_autofill_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/planning/autofill", json={"project_id": str(uuid.uuid4())})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_autofill_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.post("/api/v1/planning/autofill", json={"project_id": str(uuid.uuid4())}, headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_autofill_returns_proposals(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id, _phase_id, task_ids = await _create_project_with_tasks(client, headers)

    resp = await client.post(
        "/api/v1/planning/autofill",
        json={"project_id": project_id, "start_date": "2026-01-05"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "proposals" in data
    assert len(data["proposals"]) == 2

    for proposal in data["proposals"]:
        assert "task_id" in proposal
        assert "proposed_start_date" in proposal
        assert "proposed_end_date" in proposal
        assert "reasoning" in proposal
        assert proposal["reasoning"] != ""
        assert "is_critical" in proposal


@pytest.mark.asyncio
async def test_autofill_respects_dependency_ordering(client: AsyncClient) -> None:
    """task2 (depends on task1) must start after task1 ends."""
    headers = await _auth_headers(client, "dep@example.com")
    project_id, _phase_id, task_ids = await _create_project_with_tasks(client, headers)
    task1_id, task2_id = task_ids

    resp = await client.post(
        "/api/v1/planning/autofill",
        json={"project_id": project_id, "start_date": "2026-01-05"},
        headers=headers,
    )
    assert resp.status_code == 200
    proposals = {p["task_id"]: p for p in resp.json()["proposals"]}

    t1_end = proposals[task1_id]["proposed_end_date"]
    t2_start = proposals[task2_id]["proposed_start_date"]
    assert t2_start >= t1_end


@pytest.mark.asyncio
async def test_autofill_empty_project_returns_empty(client: AsyncClient) -> None:
    """A project with no tasks returns an empty proposals list."""
    headers = await _auth_headers(client, "empty@example.com")
    proj = await client.post("/api/v1/projects/", json={"name": "Empty Project"}, headers=headers)
    project_id = proj.json()["id"]

    resp = await client.post(
        "/api/v1/planning/autofill",
        json={"project_id": project_id},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["proposals"] == []


# ---------------------------------------------------------------------------
# POST /api/v1/planning/apply endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/planning/apply",
        json={"project_id": str(uuid.uuid4()), "task_ids": []},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_apply_updates_task_dates(client: AsyncClient) -> None:
    """Applying the schedule writes start_date/end_date to the tasks."""
    headers = await _auth_headers(client, "apply@example.com")
    project_id, phase_id, task_ids = await _create_project_with_tasks(client, headers)

    # First generate proposals
    autofill_resp = await client.post(
        "/api/v1/planning/autofill",
        json={"project_id": project_id, "start_date": "2026-01-05"},
        headers=headers,
    )
    assert autofill_resp.status_code == 200

    # Apply all task_ids
    apply_resp = await client.post(
        "/api/v1/planning/apply",
        json={
            "project_id": project_id,
            "task_ids": task_ids,
            "start_date": "2026-01-05",
        },
        headers=headers,
    )
    assert apply_resp.status_code == 200
    result = apply_resp.json()
    assert result["updated_count"] == 2

    # Verify tasks have dates set
    proj_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    phase_data = proj_resp.json()["phases"][0]
    for task in phase_data["tasks"]:
        assert task["start_date"] is not None
        assert task["end_date"] is not None


@pytest.mark.asyncio
async def test_apply_partial_task_ids(client: AsyncClient) -> None:
    """Applying only some task_ids only updates those tasks."""
    headers = await _auth_headers(client, "partial@example.com")
    project_id, phase_id, task_ids = await _create_project_with_tasks(client, headers)
    task1_id, task2_id = task_ids

    apply_resp = await client.post(
        "/api/v1/planning/apply",
        json={
            "project_id": project_id,
            "task_ids": [task1_id],
            "start_date": "2026-01-05",
        },
        headers=headers,
    )
    assert apply_resp.status_code == 200
    assert apply_resp.json()["updated_count"] == 1


# ---------------------------------------------------------------------------
# Ownership guard — User B cannot use autofill/apply on User A's project
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_autofill_forbidden_for_non_owner(client: AsyncClient) -> None:
    """User B gets 403 when calling autofill on User A's project."""
    headers_a = await _auth_headers(client, "owner-a@example.com")
    project_id, _phase_id, _task_ids = await _create_project_with_tasks(client, headers_a)

    headers_b = await _auth_headers(client, "other-b@example.com")
    resp = await client.post(
        "/api/v1/planning/autofill",
        json={"project_id": project_id, "start_date": "2026-01-05"},
        headers=headers_b,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_apply_forbidden_for_non_owner(client: AsyncClient) -> None:
    """User B gets 403 when calling apply on User A's project."""
    headers_a = await _auth_headers(client, "owner-apply-a@example.com")
    project_id, _phase_id, task_ids = await _create_project_with_tasks(client, headers_a)

    headers_b = await _auth_headers(client, "other-apply-b@example.com")
    resp = await client.post(
        "/api/v1/planning/apply",
        json={
            "project_id": project_id,
            "task_ids": task_ids,
            "start_date": "2026-01-05",
        },
        headers=headers_b,
    )
    assert resp.status_code == 403
