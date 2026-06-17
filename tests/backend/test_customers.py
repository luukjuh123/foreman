"""Tests for customer CRUD endpoints."""

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


async def _auth_headers(client: AsyncClient, email: str = "cust@example.com") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_customer(client):
    headers = await _auth_headers(client)
    resp = await client.post("/api/v1/customers/", json={
        "name": "Bouwbedrijf Jansen",
        "email": "jansen@example.nl",
        "kvk_number": "12345678",
        "vat_number": "NL123456789B01",
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Bouwbedrijf Jansen"
    assert data["email"] == "jansen@example.nl"
    assert data["kvk_number"] == "12345678"
    assert data["vat_number"] == "NL123456789B01"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_list_customers(client):
    headers = await _auth_headers(client)
    await client.post("/api/v1/customers/", json={"name": "Klant A"}, headers=headers)
    await client.post("/api/v1/customers/", json={"name": "Klant B"}, headers=headers)
    resp = await client.get("/api/v1/customers/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["data"]) == 2


@pytest.mark.asyncio
async def test_get_customer(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/customers/", json={"name": "Klant C"}, headers=headers)
    cid = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/customers/{cid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == cid


@pytest.mark.asyncio
async def test_get_customer_not_found(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/customers/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_customer(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/customers/", json={"name": "Klant D"}, headers=headers)
    cid = create_resp.json()["id"]
    resp = await client.patch(f"/api/v1/customers/{cid}", json={"address_line1": "Dorpsstraat 1", "city": "Amsterdam"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["address_line1"] == "Dorpsstraat 1"
    assert data["city"] == "Amsterdam"
    assert data["name"] == "Klant D"


@pytest.mark.asyncio
async def test_delete_customer(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/customers/", json={"name": "Klant E"}, headers=headers)
    cid = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/customers/{cid}", headers=headers)
    assert resp.status_code == 204
    get_resp = await client.get(f"/api/v1/customers/{cid}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_create_customer_minimal(client):
    """Only name is required."""
    headers = await _auth_headers(client)
    resp = await client.post("/api/v1/customers/", json={"name": "Minimale Klant"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] is None
    assert data["kvk_number"] is None
    assert data["vat_number"] is None
