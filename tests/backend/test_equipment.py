"""Tests for Equipment model + CRUD endpoints + project assignment."""

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


async def _auth(client: AsyncClient, email: str = "foreman@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Foreman", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Bouwproject Alpha") -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": name},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Create equipment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_equipment_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Betonmixer XL-3000", "category": "machine"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Betonmixer XL-3000"
    assert body["category"] == "machine"
    assert body["status"] == "available"
    assert body["purchase_price_cents"] == 0
    assert body["daily_rental_cost_cents"] == 0
    assert body["serial_number"] is None
    assert body["purchase_date"] is None
    assert body["notes"] is None
    assert body["assignments"] == []


@pytest.mark.asyncio
async def test_create_equipment_full(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={
            "name": "Steiger set A",
            "category": "scaffold",
            "status": "maintenance",
            "serial_number": "SN-12345",
            "purchase_date": "2023-06-15",
            "purchase_price_cents": 250000,
            "daily_rental_cost_cents": 5000,
            "notes": "Lichte roestplekken op frame 3",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["serial_number"] == "SN-12345"
    assert body["purchase_price_cents"] == 250000
    assert body["daily_rental_cost_cents"] == 5000
    assert body["status"] == "maintenance"


@pytest.mark.asyncio
async def test_create_equipment_invalid_category(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Mysterieus ding", "category": "spaceship"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_equipment_invalid_status(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Ding", "category": "tool", "status": "broken"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_equipment_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool"},
    )
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# List equipment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_equipment_empty(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get("/api/v1/equipment/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0
    assert body["page"] == 1


@pytest.mark.asyncio
async def test_list_equipment_owner_isolation(client: AsyncClient) -> None:
    h1 = await _auth(client, "eigenaar1@example.com")
    h2 = await _auth(client, "eigenaar2@example.com")

    await client.post("/api/v1/equipment/", json={"name": "Hamer", "category": "tool"}, headers=h1)
    await client.post("/api/v1/equipment/", json={"name": "Zaag", "category": "tool"}, headers=h2)

    resp = await client.get("/api/v1/equipment/", headers=h1)
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()["data"]]
    assert names == ["Hamer"]


@pytest.mark.asyncio
async def test_list_equipment_filter_by_status(client: AsyncClient) -> None:
    headers = await _auth(client)
    await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool", "status": "available"},
        headers=headers,
    )
    await client.post(
        "/api/v1/equipment/",
        json={"name": "Boor", "category": "tool", "status": "maintenance"},
        headers=headers,
    )
    resp = await client.get("/api/v1/equipment/?status=available", headers=headers)
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()["data"]]
    assert "Hamer" in names
    assert "Boor" not in names


@pytest.mark.asyncio
async def test_list_equipment_filter_by_category(client: AsyncClient) -> None:
    headers = await _auth(client)
    await client.post(
        "/api/v1/equipment/",
        json={"name": "Hijskraan", "category": "machine"},
        headers=headers,
    )
    await client.post(
        "/api/v1/equipment/",
        json={"name": "Steiger", "category": "scaffold"},
        headers=headers,
    )
    resp = await client.get("/api/v1/equipment/?category=machine", headers=headers)
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()["data"]]
    assert "Hijskraan" in names
    assert "Steiger" not in names


@pytest.mark.asyncio
async def test_list_equipment_pagination(client: AsyncClient) -> None:
    headers = await _auth(client)
    for i in range(5):
        await client.post(
            "/api/v1/equipment/",
            json={"name": f"Gereedschap {i}", "category": "tool"},
            headers=headers,
        )
    resp = await client.get("/api/v1/equipment/?per_page=2&page=1", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 5
    assert len(body["data"]) == 2
    assert body["page"] == 1


# ---------------------------------------------------------------------------
# Get single equipment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Compressor", "category": "machine"},
        headers=headers,
    )
    eid = resp.json()["id"]
    resp = await client.get(f"/api/v1/equipment/{eid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Compressor"


@pytest.mark.asyncio
async def test_get_equipment_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get("/api/v1/equipment/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_equipment_other_owner_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "eigenaar@example.com")
    h2 = await _auth(client, "dief@example.com")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool"},
        headers=h1,
    )
    eid = resp.json()["id"]
    resp = await client.get(f"/api/v1/equipment/{eid}", headers=h2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update equipment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Oud gereedschap", "category": "tool"},
        headers=headers,
    )
    eid = resp.json()["id"]
    resp = await client.put(
        f"/api/v1/equipment/{eid}",
        json={"name": "Nieuw gereedschap", "status": "maintenance", "daily_rental_cost_cents": 1500},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Nieuw gereedschap"
    assert body["status"] == "maintenance"
    assert body["daily_rental_cost_cents"] == 1500


@pytest.mark.asyncio
async def test_update_equipment_other_owner_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "eigenaar2@example.com")
    h2 = await _auth(client, "dief2@example.com")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool"},
        headers=h1,
    )
    eid = resp.json()["id"]
    resp = await client.put(f"/api/v1/equipment/{eid}", json={"name": "Gestolen"}, headers=h2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete equipment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Te verwijderen", "category": "other"},
        headers=headers,
    )
    eid = resp.json()["id"]
    resp = await client.delete(f"/api/v1/equipment/{eid}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/v1/equipment/{eid}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_equipment_other_owner_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "eigenaar3@example.com")
    h2 = await _auth(client, "dief3@example.com")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool"},
        headers=h1,
    )
    eid = resp.json()["id"]
    resp = await client.delete(f"/api/v1/equipment/{eid}", headers=h2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Assignment CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assign_equipment_to_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Bouwlift", "category": "machine"},
        headers=headers,
    )
    eid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/equipment/{eid}/assignments",
        json={"project_id": project_id, "assigned_date": "2025-01-10"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["project_id"] == project_id
    assert body["equipment_id"] == eid
    assert body["assigned_date"] == "2025-01-10"
    assert body["returned_date"] is None


@pytest.mark.asyncio
async def test_assign_equipment_with_notes(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers, "Project B")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Trilplaat", "category": "machine"},
        headers=headers,
    )
    eid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/equipment/{eid}/assignments",
        json={
            "project_id": project_id,
            "assigned_date": "2025-02-01",
            "returned_date": "2025-02-14",
            "notes": "Gebruikt voor fundering fase 1",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["returned_date"] == "2025-02-14"
    assert body["notes"] == "Gebruikt voor fundering fase 1"


@pytest.mark.asyncio
async def test_get_equipment_includes_assignments(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers, "Project C")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Generator", "category": "machine"},
        headers=headers,
    )
    eid = resp.json()["id"]

    await client.post(
        f"/api/v1/equipment/{eid}/assignments",
        json={"project_id": project_id, "assigned_date": "2025-03-01"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/equipment/{eid}", headers=headers)
    assert resp.status_code == 200
    assignments = resp.json()["assignments"]
    assert len(assignments) == 1
    assert assignments[0]["project_id"] == project_id


@pytest.mark.asyncio
async def test_unassign_equipment(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers, "Project D")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Pomp", "category": "tool"},
        headers=headers,
    )
    eid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/equipment/{eid}/assignments",
        json={"project_id": project_id, "assigned_date": "2025-04-01"},
        headers=headers,
    )
    aid = resp.json()["id"]

    resp = await client.delete(f"/api/v1/equipment/{eid}/assignments/{aid}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/equipment/{eid}", headers=headers)
    assert resp.json()["assignments"] == []


@pytest.mark.asyncio
async def test_assign_to_other_owners_project_rejected(client: AsyncClient) -> None:
    h1 = await _auth(client, "eigenaar4@example.com")
    h2 = await _auth(client, "eigenaar5@example.com")

    project_id = await _create_project(client, h2, "Project van eigenaar 2")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Hamer", "category": "tool"},
        headers=h1,
    )
    eid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/equipment/{eid}/assignments",
        json={"project_id": project_id, "assigned_date": "2025-05-01"},
        headers=h1,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unassign_other_owners_assignment_rejected(client: AsyncClient) -> None:
    h1 = await _auth(client, "eigenaar6@example.com")
    h2 = await _auth(client, "dief6@example.com")

    project_id = await _create_project(client, h1, "Project E")
    resp = await client.post(
        "/api/v1/equipment/",
        json={"name": "Zaag", "category": "tool"},
        headers=h1,
    )
    eid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/equipment/{eid}/assignments",
        json={"project_id": project_id, "assigned_date": "2025-06-01"},
        headers=h1,
    )
    aid = resp.json()["id"]

    resp = await client.delete(f"/api/v1/equipment/{eid}/assignments/{aid}", headers=h2)
    assert resp.status_code == 404
