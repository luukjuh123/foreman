"""Tests for Equipment Inventory v2 — depreciation, checkouts, maintenance schedules, cost allocation.

Covers:
- Equipment CRUD with depreciation_rate_bps
- Checkout/return with double-booking prevention
- MaintenanceSchedule CRUD with overdue query
- Cost allocation per project
"""

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
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_project(client: AsyncClient, headers: dict, name: str = "Project A") -> str:
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _make_equipment(client: AsyncClient, headers: dict, name: str = "Boor") -> str:
    resp = await client.post(
        "/api/v1/equipment/",
        json={
            "name": name,
            "category": "tool",
            "purchase_date": "2020-01-01",
            "purchase_price_cents": 100000,
            "depreciation_rate_bps": 2000,  # 20% per year
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Equipment CRUD — depreciation_rate_bps
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_equipment_with_depreciation(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={
            "name": "Graafmachine",
            "category": "machinery",
            "purchase_date": "2022-01-01",
            "purchase_price_cents": 5000000,
            "depreciation_rate_bps": 1000,  # 10% per year
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["depreciation_rate_bps"] == 1000
    assert body["purchase_price_cents"] == 5000000


@pytest.mark.asyncio
async def test_update_equipment_depreciation(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers, "Mixer")
    resp = await client.put(
        f"/api/v1/equipment/{eq_id}",
        json={"depreciation_rate_bps": 3000},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["depreciation_rate_bps"] == 3000


@pytest.mark.asyncio
async def test_depreciation_rate_non_negative(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "X", "category": "tool", "depreciation_rate_bps": -1},
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Checkout / return
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkout_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    resp = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-06-01T08:00:00Z",
            "expected_return": "2026-06-10T17:00:00Z",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["equipment_id"] == eq_id
    assert body["project_id"] == pid
    assert body["returned_at"] is None


@pytest.mark.asyncio
async def test_return_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    co_resp = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-06-01T08:00:00Z",
            "expected_return": "2026-06-10T17:00:00Z",
        },
        headers=headers,
    )
    co_id = co_resp.json()["id"]
    resp = await client.patch(
        f"/api/v1/equipment/{eq_id}/checkouts/{co_id}",
        json={"returned_at": "2026-06-08T16:00:00Z"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["returned_at"] is not None


@pytest.mark.asyncio
async def test_double_booking_same_equipment_rejected(client: AsyncClient) -> None:
    """Two overlapping checkouts for the same equipment must be rejected."""
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    r1 = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-07-01T08:00:00Z",
            "expected_return": "2026-07-15T17:00:00Z",
        },
        headers=headers,
    )
    assert r1.status_code == 201

    r2 = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-07-10T08:00:00Z",
            "expected_return": "2026-07-20T17:00:00Z",
        },
        headers=headers,
    )
    assert r2.status_code == 422
    assert "double" in r2.json()["detail"].lower() or "overlap" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_back_to_back_checkouts_allowed(client: AsyncClient) -> None:
    """Checkout starting exactly when previous expected_return ends — allowed."""
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    r1 = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-08-01T08:00:00Z",
            "expected_return": "2026-08-10T17:00:00Z",
        },
        headers=headers,
    )
    r2 = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-08-10T17:00:00Z",
            "expected_return": "2026-08-20T17:00:00Z",
        },
        headers=headers,
    )
    assert r1.status_code == 201
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_returned_checkout_does_not_block(client: AsyncClient) -> None:
    """After return, equipment is free to check out again in same period."""
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    co_resp = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-09-01T08:00:00Z",
            "expected_return": "2026-09-15T17:00:00Z",
        },
        headers=headers,
    )
    co_id = co_resp.json()["id"]
    # Return it early
    await client.patch(
        f"/api/v1/equipment/{eq_id}/checkouts/{co_id}",
        json={"returned_at": "2026-09-05T12:00:00Z"},
        headers=headers,
    )
    # Now book overlapping — should succeed because old checkout is closed
    r2 = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-09-06T08:00:00Z",
            "expected_return": "2026-09-12T17:00:00Z",
        },
        headers=headers,
    )
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_inverted_checkout_window_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    resp = await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-06-15T17:00:00Z",
            "expected_return": "2026-06-01T08:00:00Z",
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_checkouts(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    pid = await _make_project(client, headers)
    await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-06-01T08:00:00Z",
            "expected_return": "2026-06-05T17:00:00Z",
        },
        headers=headers,
    )
    resp = await client.get(f"/api/v1/equipment/{eq_id}/checkouts", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["equipment_id"] == eq_id


# ---------------------------------------------------------------------------
# Maintenance schedule
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_maintenance_schedule(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    resp = await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules",
        json={
            "description": "Jaarlijkse keuring",
            "due_date": "2099-06-01",
            "recurring_interval_days": 365,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["description"] == "Jaarlijkse keuring"
    assert body["due_date"] == "2099-06-01"
    assert body["recurring_interval_days"] == 365
    assert body["completed_at"] is None


@pytest.mark.asyncio
async def test_complete_maintenance_schedule(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    cr = await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules",
        json={"description": "Filter vervangen", "due_date": "2026-06-01"},
        headers=headers,
    )
    ms_id = cr.json()["id"]
    resp = await client.patch(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules/{ms_id}",
        json={"completed_at": "2026-05-30T10:00:00Z"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["completed_at"] is not None


@pytest.mark.asyncio
async def test_list_maintenance_schedules(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    for i in range(3):
        await client.post(
            f"/api/v1/equipment/{eq_id}/maintenance-schedules",
            json={"description": f"Taak {i}", "due_date": f"2099-0{i+1}-01"},
            headers=headers,
        )
    resp = await client.get(f"/api/v1/equipment/{eq_id}/maintenance-schedules", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 3


@pytest.mark.asyncio
async def test_overdue_maintenance_schedules(client: AsyncClient) -> None:
    """GET /api/v1/equipment/maintenance-schedules/overdue returns past-due incomplete items."""
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    # Past-due, incomplete
    await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules",
        json={"description": "Oud onderhoud", "due_date": "2020-01-01"},
        headers=headers,
    )
    # Future, incomplete — should NOT appear
    await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules",
        json={"description": "Toekomstig", "due_date": "2099-01-01"},
        headers=headers,
    )
    resp = await client.get("/api/v1/equipment/maintenance-schedules/overdue", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    descriptions = [d["description"] for d in data]
    assert "Oud onderhoud" in descriptions
    assert "Toekomstig" not in descriptions


@pytest.mark.asyncio
async def test_completed_item_not_in_overdue(client: AsyncClient) -> None:
    headers = await _auth(client)
    eq_id = await _make_equipment(client, headers)
    cr = await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules",
        json={"description": "Gedaan", "due_date": "2020-01-01"},
        headers=headers,
    )
    ms_id = cr.json()["id"]
    await client.patch(
        f"/api/v1/equipment/{eq_id}/maintenance-schedules/{ms_id}",
        json={"completed_at": "2020-01-01T08:00:00Z"},
        headers=headers,
    )
    resp = await client.get("/api/v1/equipment/maintenance-schedules/overdue", headers=headers)
    data = resp.json()
    descriptions = [d["description"] for d in data]
    assert "Gedaan" not in descriptions


# ---------------------------------------------------------------------------
# Cost allocation per project
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cost_allocation_per_project(client: AsyncClient) -> None:
    """GET /api/v1/equipment/cost-allocation/{project_id} returns depreciation + maintenance cost."""
    headers = await _auth(client)
    pid = await _make_project(client, headers)
    eq_id = await _make_equipment(client, headers)

    # Check out equipment to project for 10 days
    await client.post(
        f"/api/v1/equipment/{eq_id}/checkouts",
        json={
            "project_id": pid,
            "checked_out_at": "2026-06-01T00:00:00Z",
            "expected_return": "2026-06-11T00:00:00Z",
        },
        headers=headers,
    )
    # Log maintenance against equipment (generic record, cost allocated to any project using it)
    await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance",
        json={
            "maintenance_date": "2026-06-05",
            "description": "Reparatie tijdens project",
            "cost_cents": 5000,
        },
        headers=headers,
    )

    resp = await client.get(f"/api/v1/equipment/cost-allocation/{pid}", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Should have at least one entry
    assert len(body) >= 1
    entry = next(e for e in body if e["equipment_id"] == eq_id)
    # depreciation_cents = purchase_price * rate_bps / 10000 / 365 * days
    # = 100000 * 2000 / 10000 / 365 * 10 ≈ 547
    assert entry["depreciation_cents"] > 0
    assert entry["maintenance_cents"] >= 0
    assert "total_cents" in entry


@pytest.mark.asyncio
async def test_cost_allocation_empty_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _make_project(client, headers)
    resp = await client.get(f"/api/v1/equipment/cost-allocation/{pid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_cost_allocation_isolation(client: AsyncClient) -> None:
    """User A cannot see cost allocation for user B's project."""
    h1 = await _auth(client, "a@example.com")
    h2 = await _auth(client, "b@example.com")
    pid = await _make_project(client, h1)
    resp = await client.get(f"/api/v1/equipment/cost-allocation/{pid}", headers=h2)
    # Either 404 (project not found for user) or empty list — both acceptable
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        assert resp.json() == []
