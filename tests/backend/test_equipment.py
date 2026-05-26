"""Tests for Equipment/tool tracking — Phase 19.

Covers:
- CRUD for equipment items
- Project assignment (assign tool to project, release)
- Usage history per equipment item
- Maintenance schedule (log maintenance, list upcoming)
"""

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
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": "Test Project", "description": "desc"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Equipment CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={
            "name": "Betonstortmachine",
            "category": "machinery",
            "serial_number": "BC-2024-001",
            "purchase_date": "2022-03-15",
            "purchase_price_cents": 1500000,
            "notes": "Groot apparaat, opslag loods 2",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Betonstortmachine"
    assert body["category"] == "machinery"
    assert body["serial_number"] == "BC-2024-001"
    assert body["purchase_price_cents"] == 1500000
    assert body["status"] == "available"
    assert "id" in body


@pytest.mark.asyncio
async def test_create_equipment_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Hamer"
    assert body["serial_number"] is None
    assert body["purchase_price_cents"] == 0


@pytest.mark.asyncio
async def test_list_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    for name in ["Zaag", "Boor", "Schroefmachine"]:
        await client.post("/api/v1/equipment/", json={"name": name, "category": "tool"}, headers=headers)
    resp = await client.get("/api/v1/equipment/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_get_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hoogwerker", "category": "machinery"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/equipment/{eq_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hoogwerker"


@pytest.mark.asyncio
async def test_get_equipment_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get(f"/api/v1/equipment/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Old Tool", "category": "tool"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/equipment/{eq_id}",
        json={"name": "Updated Tool", "notes": "Gereviseerd"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Updated Tool"
    assert body["notes"] == "Gereviseerd"


@pytest.mark.asyncio
async def test_delete_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Weggooi Tool", "category": "tool"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/equipment/{eq_id}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/v1/equipment/{eq_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_equipment_isolation(client: AsyncClient) -> None:
    headers_a = await _auth(client, "a@example.com")
    headers_b = await _auth(client, "b@example.com")
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Privaat Tool", "category": "tool"},
        headers=headers_a,
    )
    eq_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/equipment/{eq_id}", headers=headers_b)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Project assignment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assign_equipment_to_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Mixmachine", "category": "machinery"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/equipment/{eq_id}/assignments",
        json={"project_id": project_id, "assigned_date": "2024-06-01"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["equipment_id"] == eq_id
    assert body["project_id"] == project_id
    assert body["returned_date"] is None


@pytest.mark.asyncio
async def test_release_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Steiger", "category": "scaffold"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    assign_resp = await client.post(
        f"/api/v1/equipment/{eq_id}/assignments",
        json={"project_id": project_id, "assigned_date": "2024-06-01"},
        headers=headers,
    )
    assignment_id = assign_resp.json()["id"]
    resp = await client.patch(
        f"/api/v1/equipment/{eq_id}/assignments/{assignment_id}",
        json={"returned_date": "2024-06-30"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["returned_date"] == "2024-06-30"


@pytest.mark.asyncio
async def test_list_equipment_assignments(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Trekker", "category": "vehicle"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    await client.post(
        f"/api/v1/equipment/{eq_id}/assignments",
        json={"project_id": project_id, "assigned_date": "2024-06-01"},
        headers=headers,
    )
    resp = await client.get(f"/api/v1/equipment/{eq_id}/assignments", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["equipment_id"] == eq_id


# ---------------------------------------------------------------------------
# Maintenance schedule
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_maintenance(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Compressor", "category": "machinery"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance",
        json={
            "maintenance_date": "2024-06-01",
            "description": "Oliewissel en filters vervangen",
            "cost_cents": 15000,
            "next_due_date": "2024-12-01",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["description"] == "Oliewissel en filters vervangen"
    assert body["cost_cents"] == 15000
    assert body["next_due_date"] == "2024-12-01"
    assert body["equipment_id"] == eq_id


@pytest.mark.asyncio
async def test_list_maintenance(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Generator", "category": "machinery"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    for month in [3, 6, 9]:
        await client.post(
            f"/api/v1/equipment/{eq_id}/maintenance",
            json={
                "maintenance_date": f"2024-0{month}-01",
                "description": f"Onderhoudsbeurt {month}",
                "cost_cents": 10000,
            },
            headers=headers,
        )
    resp = await client.get(f"/api/v1/equipment/{eq_id}/maintenance", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    total_cost = sum(m["cost_cents"] for m in data)
    assert total_cost == 30000


@pytest.mark.asyncio
async def test_upcoming_maintenance(client: AsyncClient) -> None:
    """GET /api/v1/equipment/maintenance/upcoming returns items with future next_due_date."""
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Kraanwagen", "category": "vehicle"},
        headers=headers,
    )
    eq_id = create_resp.json()["id"]
    # Log a maintenance with a far-future next_due_date
    await client.post(
        f"/api/v1/equipment/{eq_id}/maintenance",
        json={
            "maintenance_date": "2024-01-01",
            "description": "APK",
            "cost_cents": 50000,
            "next_due_date": "2099-01-01",
        },
        headers=headers,
    )
    resp = await client.get("/api/v1/equipment/maintenance/upcoming", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    ids = [item["equipment_id"] for item in data]
    assert eq_id in ids
