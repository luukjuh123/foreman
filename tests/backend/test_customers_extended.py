"""Tests for extended customer endpoints: pagination, search, and summary."""

import uuid

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
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "cust2@example.com") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Pagination tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_customers_paginated(client):
    """Returns paginated envelope with total, page, per_page."""
    headers = await _auth_headers(client)
    for i in range(5):
        await client.post("/api/v1/customers/", json={"name": f"Klant {i:02d}"}, headers=headers)

    resp = await client.get("/api/v1/customers/?page=1&per_page=3", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 5
    assert body["page"] == 1
    assert body["per_page"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_list_customers_page2(client):
    """Second page returns remaining items."""
    headers = await _auth_headers(client, "page2@example.com")
    for i in range(5):
        await client.post("/api/v1/customers/", json={"name": f"Klant {i:02d}"}, headers=headers)

    resp = await client.get("/api/v1/customers/?page=2&per_page=3", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 2
    assert len(body["data"]) == 2


@pytest.mark.asyncio
async def test_list_customers_default_pagination(client):
    """Default pagination is page=1, per_page=20."""
    headers = await _auth_headers(client, "default@example.com")
    await client.post("/api/v1/customers/", json={"name": "Eerste Klant"}, headers=headers)

    resp = await client.get("/api/v1/customers/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "total" in body
    assert body["page"] == 1
    assert body["per_page"] == 20


# ---------------------------------------------------------------------------
# Search tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_customers_search_by_name(client):
    """Search filters by name."""
    headers = await _auth_headers(client, "search@example.com")
    await client.post("/api/v1/customers/", json={"name": "Bouwbedrijf Jansen", "city": "Amsterdam"}, headers=headers)
    await client.post("/api/v1/customers/", json={"name": "Schildersbedrijf De Vries"}, headers=headers)

    resp = await client.get("/api/v1/customers/?search=jansen", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["name"] == "Bouwbedrijf Jansen"


@pytest.mark.asyncio
async def test_list_customers_search_by_city(client):
    """Search filters by city."""
    headers = await _auth_headers(client, "searchcity@example.com")
    await client.post("/api/v1/customers/", json={"name": "Klant X", "city": "Rotterdam"}, headers=headers)
    await client.post("/api/v1/customers/", json={"name": "Klant Y", "city": "Utrecht"}, headers=headers)

    resp = await client.get("/api/v1/customers/?search=rotterdam", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["city"] == "Rotterdam"


@pytest.mark.asyncio
async def test_list_customers_search_no_match(client):
    """Search with no matches returns empty list."""
    headers = await _auth_headers(client, "searchnone@example.com")
    await client.post("/api/v1/customers/", json={"name": "Klant Z"}, headers=headers)

    resp = await client.get("/api/v1/customers/?search=nonexistent", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["data"] == []


# ---------------------------------------------------------------------------
# Phone / notes field tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_customer_with_phone_and_notes(client):
    """Phone and notes are accepted and returned."""
    headers = await _auth_headers(client, "phone@example.com")
    resp = await client.post("/api/v1/customers/", json={
        "name": "Klant Met Tel",
        "phone": "0612345678",
        "notes": "Altijd via telefoon bereikbaar",
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["phone"] == "0612345678"
    assert data["notes"] == "Altijd via telefoon bereikbaar"


# ---------------------------------------------------------------------------
# Summary endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_customer_summary_no_invoices(client):
    """Summary returns empty lists and zero outstanding when no invoices."""
    headers = await _auth_headers(client, "summary@example.com")
    create_resp = await client.post("/api/v1/customers/", json={"name": "Lege Klant"}, headers=headers)
    cid = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/customers/{cid}/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == cid
    assert data["name"] == "Lege Klant"
    assert data["projects"] == []
    assert data["invoices"] == []
    assert data["outstanding_cents"] == 0


@pytest.mark.asyncio
async def test_customer_summary_not_found(client):
    """Summary returns 404 for unknown customer."""
    headers = await _auth_headers(client, "summary404@example.com")
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/customers/{fake_id}/summary", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_customer_summary_with_invoices(client):
    """Summary aggregates invoice totals and outstanding amount correctly."""
    import datetime

    headers = await _auth_headers(client, "summaryinv@example.com")

    # Create customer
    create_resp = await client.post("/api/v1/customers/", json={"name": "Factuur Klant"}, headers=headers)
    cid = create_resp.json()["id"]

    # Create two invoices — one sent (outstanding), one paid
    today = datetime.date.today().isoformat()
    future = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()

    inv1_resp = await client.post("/api/v1/invoices/", json={
        "customer_id": cid,
        "issue_date": today,
        "due_date": future,
        "lines": [{"description": "Werk", "quantity": 1, "unit_price_cents": 50000, "vat_rate_bp": 2100}],
    }, headers=headers)
    assert inv1_resp.status_code == 201
    inv1_id = inv1_resp.json()["id"]

    inv2_resp = await client.post("/api/v1/invoices/", json={
        "customer_id": cid,
        "issue_date": today,
        "due_date": future,
        "lines": [{"description": "Materialen", "quantity": 1, "unit_price_cents": 20000, "vat_rate_bp": 2100}],
    }, headers=headers)
    assert inv2_resp.status_code == 201
    inv2_id = inv2_resp.json()["id"]

    # Mark inv1 as sent (outstanding), inv2 as paid
    await client.post(f"/api/v1/invoices/{inv1_id}/transition", json={"status": "sent"}, headers=headers)
    await client.post(f"/api/v1/invoices/{inv2_id}/transition", json={"status": "sent"}, headers=headers)
    await client.post(f"/api/v1/invoices/{inv2_id}/transition", json={"status": "paid"}, headers=headers)

    resp = await client.get(f"/api/v1/customers/{cid}/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["invoices"]) == 2
    # Only inv1 (sent) counts as outstanding
    inv1_total = next(i["total_cents"] for i in data["invoices"] if i["id"] == inv1_id)
    assert data["outstanding_cents"] == inv1_total
