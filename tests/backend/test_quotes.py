"""Tests for the Quotes (Offertes) module: model, VAT math, numbering, and CRUD endpoints."""

from __future__ import annotations

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


async def _auth(client: AsyncClient, email: str = "quotes@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Quote Boss", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_customer(client: AsyncClient, headers: dict, **overrides) -> dict:
    body = {
        "name": "ACME B.V.",
        "email": "billing@acme.example",
        "kvk_number": "12345678",
        "vat_number": "NL123456789B01",
        "address_line1": "Hoofdstraat 1",
        "postal_code": "1011AA",
        "city": "Amsterdam",
        "country_code": "NL",
    }
    body.update(overrides)
    resp = await client.post("/api/v1/invoices/customers", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _make_quote(client: AsyncClient, headers: dict, customer_id: str, **overrides) -> dict:
    body = {
        "customer_id": customer_id,
        "valid_until": "2026-12-31",
        "notes": "Bedankt voor de aanvraag",
        "lines": [
            {
                "description": "Stucwerk woonkamer",
                "quantity": 10.0,
                "unit": "m2",
                "unit_price_cents": 5000,
                "vat_rate_bp": 2100,
            }
        ],
    }
    body.update(overrides)
    resp = await client.post("/api/v1/quotes/", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Pure-function tests for quote numbering
# ---------------------------------------------------------------------------


def test_format_quote_number() -> None:
    from app.services.quotes.numbering import format_quote_number

    assert format_quote_number(2026, 1) == "OFF-2026-0001"
    assert format_quote_number(2026, 42) == "OFF-2026-0042"
    assert format_quote_number(2030, 9999) == "OFF-2030-9999"


# ---------------------------------------------------------------------------
# Pure-function tests for quote status machine
# ---------------------------------------------------------------------------


def test_quote_status_draft_to_sent() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("draft", "sent") is True


def test_quote_status_sent_to_accepted() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("sent", "accepted") is True


def test_quote_status_sent_to_rejected() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("sent", "rejected") is True


def test_quote_status_sent_to_expired() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("sent", "expired") is True


def test_quote_status_draft_to_accepted_illegal() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("draft", "accepted") is False


def test_quote_status_accepted_is_terminal() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("accepted", "sent") is False
    assert is_legal_quote_transition("accepted", "rejected") is False


def test_quote_status_rejected_is_terminal() -> None:
    from app.services.quotes.status import is_legal_quote_transition

    assert is_legal_quote_transition("rejected", "sent") is False


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_quote_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/quotes/", json={})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_quote_computes_totals(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    payload = {
        "customer_id": customer["id"],
        "valid_until": "2026-12-31",
        "notes": "Test offerte",
        "lines": [
            {
                "description": "Tegelen badkamer",
                "quantity": 8.5,
                "unit": "m2",
                "unit_price_cents": 4500,
                "vat_rate_bp": 2100,
            },
            {
                "description": "Materiaal",
                "quantity": 1.0,
                "unit": "piece",
                "unit_price_cents": 12000,
                "vat_rate_bp": 900,
            },
        ],
    }
    resp = await client.post("/api/v1/quotes/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Line 1: net = 38250, vat = ROUND_HALF_UP(8032.5) = 8033
    # Line 2: net = 12000, vat = 1080
    assert data["subtotal_cents"] == 38250 + 12000
    assert data["vat_total_cents"] == 8033 + 1080
    assert data["total_cents"] == data["subtotal_cents"] + data["vat_total_cents"]
    assert data["status"] == "draft"
    assert data["quote_number"].startswith("OFF-2026-")
    assert len(data["lines"]) == 2


@pytest.mark.asyncio
async def test_quote_numbers_increment_per_year(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    payload = {
        "customer_id": customer["id"],
        "valid_until": "2026-06-30",
        "lines": [
            {
                "description": "x",
                "quantity": 1.0,
                "unit": "piece",
                "unit_price_cents": 10000,
                "vat_rate_bp": 2100,
            }
        ],
    }
    r1 = await client.post("/api/v1/quotes/", json=payload, headers=headers)
    assert r1.status_code == 201, r1.text
    assert r1.json()["quote_number"] == "OFF-2026-0001"

    r2 = await client.post("/api/v1/quotes/", json=payload, headers=headers)
    assert r2.json()["quote_number"] == "OFF-2026-0002"


@pytest.mark.asyncio
async def test_quote_counter_scoped_per_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "boss1q@example.com")
    h2 = await _auth(client, "boss2q@example.com")
    c1 = await _make_customer(client, h1)
    c2 = await _make_customer(client, h2)

    payload1 = {
        "customer_id": c1["id"],
        "valid_until": "2026-06-30",
        "lines": [{"description": "x", "quantity": 1.0, "unit": "piece", "unit_price_cents": 1000, "vat_rate_bp": 2100}],
    }
    payload2 = {**payload1, "customer_id": c2["id"]}

    r1 = await client.post("/api/v1/quotes/", json=payload1, headers=h1)
    r2 = await client.post("/api/v1/quotes/", json=payload2, headers=h2)
    assert r1.json()["quote_number"] == "OFF-2026-0001"
    assert r2.json()["quote_number"] == "OFF-2026-0001"


@pytest.mark.asyncio
async def test_create_quote_rejects_bad_vat(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    resp = await client.post(
        "/api/v1/quotes/",
        json={
            "customer_id": customer["id"],
            "valid_until": "2026-12-31",
            "lines": [
                {"description": "x", "quantity": 1.0, "unit": "piece", "unit_price_cents": 100, "vat_rate_bp": 1500}
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_quote_rejects_empty_lines(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    resp = await client.post(
        "/api/v1/quotes/",
        json={
            "customer_id": customer["id"],
            "valid_until": "2026-12-31",
            "lines": [],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_quote_rejects_unknown_customer(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/quotes/",
        json={
            "customer_id": "00000000-0000-0000-0000-000000000000",
            "valid_until": "2026-12-31",
            "lines": [
                {"description": "x", "quantity": 1.0, "unit": "piece", "unit_price_cents": 100, "vat_rate_bp": 2100}
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_and_get_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    created = await _make_quote(client, headers, customer["id"])

    listing = await client.get("/api/v1/quotes/", headers=headers)
    assert listing.status_code == 200
    items = listing.json()["data"]
    assert len(items) == 1
    assert items[0]["id"] == created["id"]

    one = await client.get(f"/api/v1/quotes/{created['id']}", headers=headers)
    assert one.status_code == 200
    assert one.json()["quote_number"] == created["quote_number"]
    assert len(one.json()["lines"]) == 1


@pytest.mark.asyncio
async def test_quotes_scoped_per_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner1q@example.com")
    h2 = await _auth(client, "owner2q@example.com")
    c1 = await _make_customer(client, h1)
    created = await _make_quote(client, h1, c1["id"])

    other = await client.get(f"/api/v1/quotes/{created['id']}", headers=h2)
    assert other.status_code == 404

    listing = await client.get("/api/v1/quotes/", headers=h2)
    assert listing.json()["data"] == []


@pytest.mark.asyncio
async def test_send_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    resp = await client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "sent"
    assert data["sent_at"] is not None


@pytest.mark.asyncio
async def test_accept_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    # Must send first
    await client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers)

    resp = await client.post(f"/api/v1/quotes/{quote['id']}/accept", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_cannot_accept_draft_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    # Try to accept without sending first
    resp = await client.post(f"/api/v1/quotes/{quote['id']}/accept", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_convert_quote_creates_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    # Send + accept
    await client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers)
    await client.post(f"/api/v1/quotes/{quote['id']}/accept", headers=headers)

    resp = await client.post(
        f"/api/v1/quotes/{quote['id']}/convert",
        json={"create_invoice": False},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "project_id" in data
    assert data["project_id"] is not None


@pytest.mark.asyncio
async def test_convert_quote_creates_project_and_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    # Send + accept
    await client.post(f"/api/v1/quotes/{quote['id']}/send", headers=headers)
    await client.post(f"/api/v1/quotes/{quote['id']}/accept", headers=headers)

    resp = await client.post(
        f"/api/v1/quotes/{quote['id']}/convert",
        json={"create_invoice": True},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["project_id"] is not None
    assert data["invoice_id"] is not None


@pytest.mark.asyncio
async def test_cannot_convert_non_accepted_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    resp = await client.post(
        f"/api/v1/quotes/{quote['id']}/convert",
        json={"create_invoice": False},
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_list_quotes_status_filter(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    quote = await _make_quote(client, headers, customer["id"])

    # Filter by draft — should find it
    resp = await client.get("/api/v1/quotes/?status=draft", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1

    # Filter by sent — should find nothing
    resp = await client.get("/api/v1/quotes/?status=sent", headers=headers)
    assert len(resp.json()["data"]) == 0


@pytest.mark.asyncio
async def test_get_quote_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get("/api/v1/quotes/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404
