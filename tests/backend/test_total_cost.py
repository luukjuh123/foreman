"""Tests for project total-cost aggregation (Phase 7)."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.material import Budget, BudgetItem, Material
from app.models.project import Phase, Project, Task
from app.models.user import User

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


async def _auth_headers(client: AsyncClient, email: str = "tc@example.com") -> tuple[dict, uuid.UUID]:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "TC", "password": "testpass123"},
    )
    body = resp.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, None


async def _seed_full_project(
    session_factory,
    *,
    materials: list[dict] | None = None,
    tasks_hours: list[float] | None = None,
    budget_items: list[tuple[str, int]] | None = None,
    owner_email: str = "tc-seed@example.com",
) -> tuple[uuid.UUID, uuid.UUID]:
    """Create a project with optional materials, tasks (with hours), and budget items.

    Returns (project_id, owner_id).
    """
    project_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    async with session_factory() as s:
        s.add(
            User(id=owner_id, email=owner_email, name="u", hashed_password="x")
        )
        s.add(Project(id=project_id, owner_id=owner_id, name="P"))
        phase_id = uuid.uuid4()
        s.add(Phase(id=phase_id, project_id=project_id, name="Ph"))
        for hours in tasks_hours or []:
            s.add(Task(phase_id=phase_id, name="t", estimated_hours=hours))
        task_for_materials = uuid.uuid4()
        if materials:
            s.add(Task(id=task_for_materials, phase_id=phase_id, name="mt"))
            for m in materials:
                s.add(Material(task_id=task_for_materials, **m))
        if budget_items is not None:
            budget = Budget(project_id=project_id)
            s.add(budget)
            await s.flush()
            for category, amount in budget_items:
                s.add(
                    BudgetItem(
                        budget_id=budget.id,
                        category=category,
                        name=category,
                        estimated_cents=amount,
                    )
                )
        await s.commit()
    return project_id, owner_id


# ---------------------------------------------------------------------------
# Endpoint behaviour
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_total_cost_empty_project_is_zero(client: AsyncClient) -> None:
    headers, _ = await _auth_headers(client)
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/total-cost", headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_cents"] == 0
    assert body["breakdown"]["materials_cents"] == 0
    assert body["breakdown"]["labor_cents"] == 0
    assert body["breakdown"]["equipment_cents"] == 0
    assert body["breakdown"]["overhead_cents"] == 0


@pytest.mark.asyncio
async def test_total_cost_sums_materials_labor_equipment_overhead(client: AsyncClient) -> None:
    headers, _ = await _auth_headers(client)
    # Create project + phase + task with 4 hours of work, and a material
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "T", "estimated_hours": 4.0},
        headers=headers,
    )
    # Add equipment + overhead budget items
    await client.post(
        f"/api/v1/financials/projects/{proj['id']}/budget/items",
        json={"category": "equipment", "name": "kraan", "estimated_cents": 30000},
        headers=headers,
    )
    await client.post(
        f"/api/v1/financials/projects/{proj['id']}/budget/items",
        json={"category": "overhead", "name": "office", "estimated_cents": 10000},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/total-cost?hourly_rate_cents=5000",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # labor = 4 hrs × 5000 cents = 20000
    assert body["breakdown"]["labor_cents"] == 20000
    assert body["breakdown"]["equipment_cents"] == 30000
    assert body["breakdown"]["overhead_cents"] == 10000
    assert body["breakdown"]["materials_cents"] == 0  # no materials yet
    assert body["total_cents"] == 60000
    assert body["hourly_rate_cents"] == 5000


@pytest.mark.asyncio
async def test_total_cost_includes_materials(
    client: AsyncClient, session_factory
) -> None:
    headers, _ = await _auth_headers(client)
    # Direct DB seed so we control materials precisely
    project_id, owner_id = await _seed_full_project(
        session_factory,
        materials=[
            {"name": "M1", "quantity": 2.0, "unit_price_cents": 1500},
        ],
        tasks_hours=[1.0],
        owner_email="solo@example.com",
    )
    # Register a user whose token will be valid against this DB. The seeded
    # project belongs to `owner_id`; we need to authenticate as that user.
    # Simpler: directly mint a token by registering with same email pattern.
    # But seeded user wasn't created via /register so password is "x".
    # Workaround: hit /register with the seeded user's email — duplicate
    # will fail, so we use a fresh user and create the project via API.
    # Skip this seeded path and recreate via API:
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    task = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
            json={"name": "T", "estimated_hours": 0.0},
            headers=headers,
        )
    ).json()
    # Insert materials directly using the shared session_factory.
    async with session_factory() as s:
        s.add(
            Material(
                task_id=uuid.UUID(task["id"]),
                name="M1",
                quantity=2.0,
                unit_price_cents=1500,
            )
        )
        await s.commit()

    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/total-cost?hourly_rate_cents=0",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["breakdown"]["materials_cents"] == 3000
    assert body["breakdown"]["labor_cents"] == 0
    assert body["total_cents"] == 3000


@pytest.mark.asyncio
async def test_total_cost_reports_missing_materials(
    client: AsyncClient, session_factory
) -> None:
    headers, _ = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases",
            json={"name": "Ph"},
            headers=headers,
        )
    ).json()
    task = (
        await client.post(
            f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
            json={"name": "T"},
            headers=headers,
        )
    ).json()
    async with session_factory() as s:
        s.add(
            Material(
                task_id=uuid.UUID(task["id"]),
                name="unknown",
                quantity=1.0,
                unit_price_cents=0,
            )
        )
        await s.commit()

    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/total-cost?hourly_rate_cents=0",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["materials_missing_count"] == 1
    assert body["breakdown"]["materials_cents"] == 0
    assert body["total_cents"] == 0


@pytest.mark.asyncio
async def test_total_cost_other_user_forbidden(client: AsyncClient) -> None:
    h1, _ = await _auth_headers(client, "a@example.com")
    h2, _ = await _auth_headers(client, "b@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()
    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/total-cost", headers=h2
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_total_cost_unknown_project(client: AsyncClient) -> None:
    headers, _ = await _auth_headers(client)
    resp = await client.get(
        f"/api/v1/financials/projects/{uuid.uuid4()}/total-cost", headers=headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_total_cost_excludes_other_categories(client: AsyncClient) -> None:
    """Budget items in 'materials', 'labor', or 'other' are NOT double-counted.

    Materials and labor totals come from live aggregation, not from budget
    items. Only ``equipment`` and ``overhead`` budget items contribute.
    """
    headers, _ = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    for cat, amt in [
        ("materials", 99999),
        ("labor", 88888),
        ("other", 77777),
        ("equipment", 11111),
        ("overhead", 22222),
    ]:
        await client.post(
            f"/api/v1/financials/projects/{proj['id']}/budget/items",
            json={"category": cat, "name": cat, "estimated_cents": amt},
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/financials/projects/{proj['id']}/total-cost?hourly_rate_cents=0",
        headers=headers,
    )
    body = resp.json()
    assert body["breakdown"]["equipment_cents"] == 11111
    assert body["breakdown"]["overhead_cents"] == 22222
    assert body["breakdown"]["other_cents"] == 77777
    assert body["total_cents"] == 11111 + 22222 + 77777
