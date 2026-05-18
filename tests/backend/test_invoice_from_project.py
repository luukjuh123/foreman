"""Tests for invoice generation from project data."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.material import Material
from app.models.project import Phase, Project, Task

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
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _register(client: AsyncClient, session_factory, email: str = "owner@example.com") -> tuple[dict, str]:
    from app.models.user import User
    from sqlalchemy import select

    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Owner", "password": "supersecret"},
    )
    body = reg.json()
    async with session_factory() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    return {"Authorization": f"Bearer {body['access_token']}"}, str(user.id)


async def _seed_project(
    session_factory,
    owner_id: str,
    *,
    with_material: bool = True,
    with_labor: bool = True,
) -> str:
    """Insert a project with one phase/task; optionally with material and labor."""
    import uuid

    async with session_factory() as db:
        project = Project(
            id=uuid.uuid4(),
            owner_id=uuid.UUID(owner_id),
            name="Garden Shed",
            status="active",
        )
        phase = Phase(project=project, name="Build", order_index=0)
        task = Task(
            phase=phase,
            name="Frame assembly",
            labor_cost_cents=15000 if with_labor else 0,
            estimated_hours=5.0,
        )
        db.add_all([project, phase, task])
        await db.flush()
        if with_material:
            db.add(
                Material(
                    task_id=task.id,
                    name="Pine 2x4",
                    quantity=2.0,
                    unit="piece",
                    unit_price_cents=5000,
                )
            )
        await db.commit()
        return str(project.id)


async def _make_customer(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/invoices/customers",
        json={"name": "Acme", "country_code": "NL"},
        headers=headers,
    )
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_invoice_from_project_aggregates_materials_and_labor(
    app_with_db, client
):
    _, session_factory = app_with_db
    headers, owner_id = await _register(client, session_factory)
    project_id = await _seed_project(session_factory, owner_id)
    customer_id = await _make_customer(client, headers)

    resp = await client.post(
        f"/api/v1/invoices/from-project/{project_id}",
        json={"customer_id": customer_id, "issue_date": "2026-05-01"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["project_id"] == project_id
    assert data["status"] == "draft"
    # 1 material line + 1 labor line
    assert len(data["lines"]) == 2

    by_desc = {ln["description"]: ln for ln in data["lines"]}
    mat = next(ln for k, ln in by_desc.items() if "Pine" in k)
    lab = next(ln for k, ln in by_desc.items() if "Frame" in k or "Arbeid" in k)

    assert mat["quantity"] == 2.0
    assert mat["unit_price_cents"] == 5000
    assert mat["line_net_cents"] == 10000

    assert lab["unit_price_cents"] == 15000
    assert lab["line_net_cents"] == 15000

    # Totals: 25000 net, 21% VAT = 5250, total = 30250
    assert data["subtotal_cents"] == 25000
    assert data["vat_total_cents"] == 5250
    assert data["total_cents"] == 30250


@pytest.mark.asyncio
async def test_create_invoice_from_project_respects_include_flags(
    app_with_db, client
):
    _, session_factory = app_with_db
    headers, owner_id = await _register(client, session_factory)
    project_id = await _seed_project(session_factory, owner_id)
    customer_id = await _make_customer(client, headers)

    resp = await client.post(
        f"/api/v1/invoices/from-project/{project_id}",
        json={
            "customer_id": customer_id,
            "issue_date": "2026-05-01",
            "include_labor": False,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["lines"]) == 1
    assert data["subtotal_cents"] == 10000


@pytest.mark.asyncio
async def test_create_invoice_from_project_rejects_empty(app_with_db, client):
    _, session_factory = app_with_db
    headers, owner_id = await _register(client, session_factory)
    project_id = await _seed_project(
        session_factory, owner_id, with_material=False, with_labor=False
    )
    customer_id = await _make_customer(client, headers)

    resp = await client.post(
        f"/api/v1/invoices/from-project/{project_id}",
        json={"customer_id": customer_id, "issue_date": "2026-05-01"},
        headers=headers,
    )
    assert resp.status_code == 422
    assert "no billable" in resp.text.lower() or "empty" in resp.text.lower()


@pytest.mark.asyncio
async def test_create_invoice_from_project_404_when_missing(app_with_db, client):
    _, session_factory = app_with_db
    headers, _ = await _register(client, session_factory)
    customer_id = await _make_customer(client, headers)
    resp = await client.post(
        "/api/v1/invoices/from-project/00000000-0000-0000-0000-000000000000",
        json={"customer_id": customer_id, "issue_date": "2026-05-01"},
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_invoice_from_project_other_owner_forbidden(
    app_with_db, client
):
    _, session_factory = app_with_db
    h1, owner1 = await _register(client, session_factory, "a@example.com")
    h2, _ = await _register(client, session_factory, "b@example.com")
    project_id = await _seed_project(session_factory, owner1)
    customer_id = await _make_customer(client, h2)

    resp = await client.post(
        f"/api/v1/invoices/from-project/{project_id}",
        json={"customer_id": customer_id, "issue_date": "2026-05-01"},
        headers=h2,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_invoice_from_project_supports_custom_vat_rate(
    app_with_db, client
):
    _, session_factory = app_with_db
    headers, owner_id = await _register(client, session_factory)
    project_id = await _seed_project(session_factory, owner_id)
    customer_id = await _make_customer(client, headers)

    resp = await client.post(
        f"/api/v1/invoices/from-project/{project_id}",
        json={
            "customer_id": customer_id,
            "issue_date": "2026-05-01",
            "default_vat_rate_bp": 900,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    # 9% of 25000 = 2250
    assert data["vat_total_cents"] == 2250
    assert all(ln["vat_rate_bp"] == 900 for ln in data["lines"])
