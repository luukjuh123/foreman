"""Tests for Supplier Order Management (Phase 20).

Covers:
- SupplierOrder and SupplierOrderLine model persistence
- Status enum values: draft, placed, shipped, delivered, cancelled
- CRUD endpoints under /api/v1/orders/
- Budget matching service — received materials update BudgetItem actual_cents
- Auth & ownership enforcement
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.material import Budget, BudgetItem
from app.models.project import Phase, Project, Task
from app.models.supplier_order import OrderStatus, SupplierOrder, SupplierOrderLine
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite://"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


async def _auth_headers(client: AsyncClient, email: str = "orders@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Orders User", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> str:
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Model tests — SupplierOrder
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_supplier_order_persists(session_factory) -> None:
    """SupplierOrder can be created and retrieved."""
    async with session_factory() as db:
        user = User(email="u@test.io", name="U", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Build")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        order = SupplierOrder(
            project_id=project.id,
            store="hornbach",
            status=OrderStatus.draft,
            notes="first order",
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        assert order.id is not None
        assert order.status == OrderStatus.draft
        assert order.store == "hornbach"
        assert order.notes == "first order"

    async with session_factory() as db:
        row = (await db.execute(select(SupplierOrder).where(SupplierOrder.project_id == project.id))).scalar_one()
        assert row.store == "hornbach"
        assert row.status == OrderStatus.draft


@pytest.mark.asyncio
async def test_supplier_order_default_status_is_draft(session_factory) -> None:
    """Default status is draft when not specified."""
    async with session_factory() as db:
        user = User(email="u2@test.io", name="U2", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Build2")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        order = SupplierOrder(project_id=project.id, store="gamma")
        db.add(order)
        await db.commit()
        await db.refresh(order)

        assert order.status == OrderStatus.draft


@pytest.mark.asyncio
async def test_supplier_order_line_persists(session_factory) -> None:
    """SupplierOrderLine stores product, quantity, unit_price_cents."""
    async with session_factory() as db:
        user = User(email="u3@test.io", name="U3", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Build3")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        phase = Phase(project_id=project.id, name="Phase 1")
        db.add(phase)
        await db.commit()
        await db.refresh(phase)

        task = Task(phase_id=phase.id, name="Task 1")
        db.add(task)
        await db.commit()
        await db.refresh(task)

        order = SupplierOrder(project_id=project.id, store="praxis")
        db.add(order)
        await db.commit()
        await db.refresh(order)

        line = SupplierOrderLine(
            order_id=order.id,
            product_id="PRX-001",
            product_name="Schroef M6x50",
            product_url="https://praxis.nl/p/PRX-001",
            quantity=100,
            unit_price_cents=12,
            store="praxis",
        )
        db.add(line)
        await db.commit()
        await db.refresh(line)

        assert line.id is not None
        assert line.product_name == "Schroef M6x50"
        assert line.quantity == 100
        assert line.unit_price_cents == 12
        assert line.total_price_cents == 1200  # 100 * 12


@pytest.mark.asyncio
async def test_order_status_enum_values(session_factory) -> None:
    """All status values can be stored and retrieved."""
    statuses = [
        OrderStatus.draft,
        OrderStatus.placed,
        OrderStatus.shipped,
        OrderStatus.delivered,
        OrderStatus.cancelled,
    ]
    async with session_factory() as db:
        user = User(email="u4@test.io", name="U4", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Build4")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        for s in statuses:
            order = SupplierOrder(project_id=project.id, store="gamma", status=s)
            db.add(order)
        await db.commit()

    async with session_factory() as db:
        rows = (await db.execute(select(SupplierOrder).where(SupplierOrder.project_id == project.id))).scalars().all()
        stored_statuses = {r.status for r in rows}
        assert stored_statuses == set(statuses)


# ---------------------------------------------------------------------------
# API — create order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_order_returns_201(client) -> None:
    """POST /api/v1/orders/ creates a draft order."""
    headers = await _auth_headers(client, "create@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.post(
        "/api/v1/orders/",
        json={
            "project_id": project_id,
            "store": "hornbach",
            "lines": [
                {
                    "product_id": "H-001",
                    "product_name": "Cement 25kg",
                    "product_url": "https://hornbach.nl/p/H-001",
                    "quantity": 5,
                    "unit_price_cents": 850,
                    "store": "hornbach",
                }
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["store"] == "hornbach"
    assert body["status"] == "draft"
    assert len(body["lines"]) == 1
    assert body["lines"][0]["product_name"] == "Cement 25kg"
    assert body["lines"][0]["total_price_cents"] == 4250  # 5 * 850


@pytest.mark.asyncio
async def test_create_order_requires_auth(client) -> None:
    """Unauthenticated request is rejected."""
    resp = await client.post(
        "/api/v1/orders/",
        json={"project_id": str(uuid.uuid4()), "store": "gamma", "lines": []},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_order_project_not_found(client) -> None:
    """Order creation for a non-existent project returns 404."""
    headers = await _auth_headers(client, "nf@example.com")
    resp = await client.post(
        "/api/v1/orders/",
        json={"project_id": str(uuid.uuid4()), "store": "gamma", "lines": []},
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_order_other_users_project_forbidden(client) -> None:
    """Cannot create order on another user's project."""
    h1 = await _auth_headers(client, "owner@example.com")
    h2 = await _auth_headers(client, "other@example.com")
    project_id = await _create_project(client, h1)

    resp = await client.post(
        "/api/v1/orders/",
        json={"project_id": project_id, "store": "gamma", "lines": []},
        headers=h2,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# API — list orders per project
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_orders_returns_empty_list(client) -> None:
    """New project has no orders."""
    headers = await _auth_headers(client, "list@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.get(f"/api/v1/orders/?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []


@pytest.mark.asyncio
async def test_list_orders_returns_created_order(client) -> None:
    """Created order appears in list."""
    headers = await _auth_headers(client, "list2@example.com")
    project_id = await _create_project(client, headers)

    await client.post(
        "/api/v1/orders/",
        json={"project_id": project_id, "store": "gamma", "lines": []},
        headers=headers,
    )
    resp = await client.get(f"/api/v1/orders/?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1


@pytest.mark.asyncio
async def test_list_orders_requires_auth(client) -> None:
    headers = await _auth_headers(client, "listauth@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.get(f"/api/v1/orders/?project_id={project_id}")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# API — update delivery status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_order_status(client) -> None:
    """PATCH /api/v1/orders/{id}/status updates the order status."""
    headers = await _auth_headers(client, "status@example.com")
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/orders/",
        json={"project_id": project_id, "store": "praxis", "lines": []},
        headers=headers,
    )
    order_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "placed"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "placed"


@pytest.mark.asyncio
async def test_update_status_invalid_value(client) -> None:
    """Invalid status value returns 422."""
    headers = await _auth_headers(client, "invalid@example.com")
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/orders/",
        json={"project_id": project_id, "store": "praxis", "lines": []},
        headers=headers,
    )
    order_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "flying"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_status_not_found(client) -> None:
    headers = await _auth_headers(client, "nf2@example.com")
    resp = await client.patch(
        f"/api/v1/orders/{uuid.uuid4()}/status",
        json={"status": "placed"},
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# API — mark items received (triggers budget match)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_received_updates_budget_actual_costs(client, app_with_db, session_factory) -> None:
    """POST /api/v1/orders/{id}/receive updates BudgetItem actual_cents."""
    headers = await _auth_headers(client, "receive@example.com")
    project_id = await _create_project(client, headers)

    # Create the order with one line
    create_resp = await client.post(
        "/api/v1/orders/",
        json={
            "project_id": project_id,
            "store": "bouwmaat",
            "lines": [
                {
                    "product_id": "BM-001",
                    "product_name": "Baksteen (per 100 stuks)",
                    "product_url": "https://bouwmaat.nl/p/BM-001",
                    "quantity": 200,
                    "unit_price_cents": 35,
                    "store": "bouwmaat",
                }
            ],
        },
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    order_id = create_resp.json()["id"]

    # Seed a Budget + BudgetItem for the project in the test DB
    async with session_factory() as db:
        budget = Budget(
            project_id=uuid.UUID(project_id),
            total_budget_cents=100_000,
        )
        db.add(budget)
        await db.commit()
        await db.refresh(budget)

        item = BudgetItem(
            budget_id=budget.id,
            category="materials",
            name="Metselwerk",
            estimated_cents=10_000,
            actual_cents=0,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        item_id = item.id

    # Mark as received — specify which budget item to update
    resp = await client.post(
        f"/api/v1/orders/{order_id}/receive",
        json={"budget_item_id": str(item_id)},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "delivered"
    assert body["matched_budget_item_id"] == str(item_id)
    assert body["added_actual_cents"] == 7000  # 200 * 35

    # Verify budget item actual_cents was updated in DB
    async with session_factory() as db:
        updated = (await db.execute(select(BudgetItem).where(BudgetItem.id == item_id))).scalar_one()
        assert updated.actual_cents == 7000


@pytest.mark.asyncio
async def test_mark_received_without_budget_item_still_sets_delivered(client) -> None:
    """Receive without a budget_item_id still sets status to delivered."""
    headers = await _auth_headers(client, "receive2@example.com")
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/orders/",
        json={"project_id": project_id, "store": "gamma", "lines": []},
        headers=headers,
    )
    order_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/orders/{order_id}/receive",
        json={},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "delivered"


@pytest.mark.asyncio
async def test_mark_received_requires_auth(client) -> None:
    resp = await client.post(f"/api/v1/orders/{uuid.uuid4()}/receive", json={})
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Budget matching service — pure unit tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_budget_match_adds_to_existing_actual_cents(session_factory) -> None:
    """match_order_to_budget adds order total to budget item's existing actual_cents."""
    from app.services.orders.budget_match import match_order_to_budget

    async with session_factory() as db:
        user = User(email="match@test.io", name="M", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Match Project")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        budget = Budget(project_id=project.id, total_budget_cents=50_000)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)

        item = BudgetItem(
            budget_id=budget.id,
            category="materials",
            name="Fundament",
            estimated_cents=20_000,
            actual_cents=3_000,  # pre-existing costs
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        order = SupplierOrder(project_id=project.id, store="hornbach", status=OrderStatus.placed)
        db.add(order)
        await db.commit()
        await db.refresh(order)

        line = SupplierOrderLine(
            order_id=order.id,
            product_id="H-100",
            product_name="Beton",
            product_url="https://hornbach.nl/p/H-100",
            quantity=10,
            unit_price_cents=500,
            store="hornbach",
        )
        db.add(line)
        await db.commit()
        await db.refresh(line)

        added = await match_order_to_budget(db, order_id=order.id, budget_item_id=item.id)

    assert added == 5_000  # 10 * 500

    async with session_factory() as db:
        updated = (await db.execute(select(BudgetItem).where(BudgetItem.id == item.id))).scalar_one()
        assert updated.actual_cents == 8_000  # 3000 + 5000


@pytest.mark.asyncio
async def test_budget_match_returns_zero_for_empty_order(session_factory) -> None:
    """Order with no lines contributes zero to the budget item."""
    from app.services.orders.budget_match import match_order_to_budget

    async with session_factory() as db:
        user = User(email="empty@test.io", name="E", hashed_password="h")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        project = Project(owner_id=user.id, name="Empty Order Project")
        db.add(project)
        await db.commit()
        await db.refresh(project)

        budget = Budget(project_id=project.id, total_budget_cents=10_000)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)

        item = BudgetItem(
            budget_id=budget.id,
            category="materials",
            name="Ramen",
            estimated_cents=5_000,
            actual_cents=1_000,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        order = SupplierOrder(project_id=project.id, store="gamma")
        db.add(order)
        await db.commit()
        await db.refresh(order)

        added = await match_order_to_budget(db, order_id=order.id, budget_item_id=item.id)

    assert added == 0

    async with session_factory() as db:
        unchanged = (await db.execute(select(BudgetItem).where(BudgetItem.id == item.id))).scalar_one()
        assert unchanged.actual_cents == 1_000  # unchanged
