"""Tests for Customer CRUD endpoints."""

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


async def _auth(client: AsyncClient, email: str = "owner@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Owner", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_customer_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Woonbedrijf B.V."},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Woonbedrijf B.V."
    assert body["email"] is None
    assert body["phone"] is None
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_create_customer_full(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/customers/",
        json={
            "name": "Bouw & Zo B.V.",
            "contact_name": "Piet Jansen",
            "email": "piet@bouwenzo.nl",
            "phone": "+31612345678",
            "address_line1": "Hoofdstraat 1",
            "postal_code": "1234 AB",
            "city": "Amsterdam",
            "kvk_number": "12345678",
            "vat_number": "NL123456789B01",
            "notes": "Vaste klant",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "piet@bouwenzo.nl"
    assert body["contact_name"] == "Piet Jansen"
    assert body["kvk_number"] == "12345678"
    assert body["city"] == "Amsterdam"


@pytest.mark.asyncio
async def test_create_customer_missing_name(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/customers/",
        json={"email": "test@test.nl"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_customer_unauthenticated(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/customers/",
        json={"name": "X B.V."},
    )
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_customers_owner_scoped(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@example.com")
    h2 = await _auth(client, "b@example.com")
    await client.post("/api/v1/customers/", json={"name": "Alpha B.V."}, headers=h1)
    await client.post("/api/v1/customers/", json={"name": "Beta B.V."}, headers=h2)
    resp = await client.get("/api/v1/customers/", headers=h1)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["name"] == "Alpha B.V."


@pytest.mark.asyncio
async def test_list_customers_pagination(client: AsyncClient) -> None:
    headers = await _auth(client)
    for i in range(5):
        await client.post(
            "/api/v1/customers/",
            json={"name": f"Company {i}"},
            headers=headers,
        )
    resp = await client.get("/api/v1/customers/?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 5
    assert len(body["data"]) == 2
    assert body["page"] == 1
    assert body["per_page"] == 2


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_customer_by_id(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Test B.V."},
        headers=headers,
    )
    cid = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/customers/{cid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == cid


@pytest.mark.asyncio
async def test_get_customer_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    import uuid
    resp = await client.get(f"/api/v1/customers/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_customer_other_owner_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner1@example.com")
    h2 = await _auth(client, "owner2@example.com")
    create_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Private B.V."},
        headers=h1,
    )
    cid = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/customers/{cid}", headers=h2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_customer(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Old Name B.V."},
        headers=headers,
    )
    cid = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/customers/{cid}",
        json={"name": "New Name B.V.", "city": "Rotterdam"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "New Name B.V."
    assert body["city"] == "Rotterdam"


@pytest.mark.asyncio
async def test_update_customer_other_owner_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "c1@example.com")
    h2 = await _auth(client, "c2@example.com")
    create_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Owned B.V."},
        headers=h1,
    )
    cid = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/customers/{cid}",
        json={"name": "Stolen"},
        headers=h2,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_customer(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "To Delete B.V."},
        headers=headers,
    )
    cid = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/customers/{cid}", headers=headers)
    assert resp.status_code == 204
    # No longer in list
    list_resp = await client.get("/api/v1/customers/", headers=headers)
    assert list_resp.json()["total"] == 0
    # No longer retrievable
    get_resp = await client.get(f"/api/v1/customers/{cid}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_customer_other_owner_returns_404(client: AsyncClient) -> None:
    h1 = await _auth(client, "d1@example.com")
    h2 = await _auth(client, "d2@example.com")
    create_resp = await client.post(
        "/api/v1/customers/",
        json={"name": "Mine B.V."},
        headers=h1,
    )
    cid = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/customers/{cid}", headers=h2)
    assert resp.status_code == 404
