"""Tests for the Invoice model, VAT math, and yearly numbering counter."""

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


async def _auth(client: AsyncClient, email: str = "inv@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Inv Boss", "password": "supersecret"},
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


# ---------------------------------------------------------------------------
# Pure-function tests for VAT math
# ---------------------------------------------------------------------------


def test_compute_line_totals_21pct() -> None:
    from app.services.invoices.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=3.0, unit_price_cents=1250, vat_rate_bp=2100)
    assert net == 3750
    assert vat == 788


def test_compute_line_totals_9pct() -> None:
    from app.services.invoices.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=2.0, unit_price_cents=10000, vat_rate_bp=900)
    assert net == 20000
    assert vat == 1800


def test_compute_line_totals_zero_vat() -> None:
    from app.services.invoices.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=1.0, unit_price_cents=50000, vat_rate_bp=0)
    assert net == 50000
    assert vat == 0


def test_invalid_vat_rate_rejected() -> None:
    from app.services.invoices.totals import compute_line_totals

    with pytest.raises(ValueError):
        compute_line_totals(quantity=1.0, unit_price_cents=100, vat_rate_bp=1500)


def test_compute_invoice_totals_aggregates_lines() -> None:
    from app.services.invoices.totals import compute_invoice_totals

    lines = [
        {"quantity": 3.0, "unit_price_cents": 1250, "vat_rate_bp": 2100},
        {"quantity": 2.0, "unit_price_cents": 10000, "vat_rate_bp": 900},
    ]
    totals = compute_invoice_totals(lines)
    assert totals["subtotal_cents"] == 3750 + 20000
    assert totals["vat_total_cents"] == 788 + 1800
    assert totals["total_cents"] == totals["subtotal_cents"] + totals["vat_total_cents"]


def test_format_invoice_number() -> None:
    from app.services.invoices.numbering import format_invoice_number

    assert format_invoice_number(2026, 1) == "2026-0001"
    assert format_invoice_number(2026, 42) == "2026-0042"
    assert format_invoice_number(2030, 9999) == "2030-9999"


@pytest.mark.asyncio
async def test_invoice_numbers_increment_per_year(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    payload = {
        "customer_id": customer["id"],
        "issue_date": "2026-03-01",
        "payment_terms_days": 30,
        "lines": [
            {
                "description": "Stucwerk woonkamer",
                "quantity": 1.0,
                "unit": "piece",
                "unit_price_cents": 50000,
                "vat_rate_bp": 2100,
            }
        ],
    }
    r1 = await client.post("/api/v1/invoices/", json=payload, headers=headers)
    assert r1.status_code == 201, r1.text
    assert r1.json()["invoice_number"] == "2026-0001"

    r2 = await client.post("/api/v1/invoices/", json=payload, headers=headers)
    assert r2.json()["invoice_number"] == "2026-0002"

    payload_2027 = {**payload, "issue_date": "2027-01-15"}
    r3 = await client.post("/api/v1/invoices/", json=payload_2027, headers=headers)
    assert r3.json()["invoice_number"] == "2027-0001"


@pytest.mark.asyncio
async def test_invoice_counter_scoped_per_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "boss1@example.com")
    h2 = await _auth(client, "boss2@example.com")
    c1 = await _make_customer(client, h1)
    c2 = await _make_customer(client, h2)

    payload1 = {
        "customer_id": c1["id"],
        "issue_date": "2026-06-01",
        "payment_terms_days": 30,
        "lines": [
            {"description": "x", "quantity": 1.0, "unit": "piece",
             "unit_price_cents": 1000, "vat_rate_bp": 2100}
        ],
    }
    payload2 = {**payload1, "customer_id": c2["id"]}

    r1 = await client.post("/api/v1/invoices/", json=payload1, headers=h1)
    r2 = await client.post("/api/v1/invoices/", json=payload2, headers=h2)
    assert r1.json()["invoice_number"] == "2026-0001"
    assert r2.json()["invoice_number"] == "2026-0001"


@pytest.mark.asyncio
async def test_create_invoice_computes_totals(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    payload = {
        "customer_id": customer["id"],
        "issue_date": "2026-04-01",
        "payment_terms_days": 14,
        "notes": "Bedankt voor de opdracht",
        "lines": [
            {"description": "Tegelen badkamer", "quantity": 8.5, "unit": "m2",
             "unit_price_cents": 4500, "vat_rate_bp": 2100},
            {"description": "Materiaal", "quantity": 1.0, "unit": "piece",
             "unit_price_cents": 12000, "vat_rate_bp": 900},
        ],
    }
    resp = await client.post("/api/v1/invoices/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Line 1: net = 38250, vat = ROUND_HALF_UP(8032.5) = 8033
    # Line 2: net = 12000, vat = 1080
    assert data["subtotal_cents"] == 38250 + 12000
    assert data["vat_total_cents"] == 8033 + 1080
    assert data["total_cents"] == data["subtotal_cents"] + data["vat_total_cents"]
    assert data["status"] == "draft"
    assert data["invoice_number"].startswith("2026-")
    assert data["due_date"] == "2026-04-15"
    assert len(data["lines"]) == 2


@pytest.mark.asyncio
async def test_create_invoice_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/invoices/", json={})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_invoice_rejects_empty_lines(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer["id"],
            "issue_date": "2026-04-01",
            "payment_terms_days": 30,
            "lines": [],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_invoice_rejects_bad_vat(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer["id"],
            "issue_date": "2026-04-01",
            "payment_terms_days": 30,
            "lines": [
                {"description": "x", "quantity": 1.0, "unit": "piece",
                 "unit_price_cents": 100, "vat_rate_bp": 1500}
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_invoice_rejects_unknown_customer(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": "00000000-0000-0000-0000-000000000000",
            "issue_date": "2026-04-01",
            "payment_terms_days": 30,
            "lines": [
                {"description": "x", "quantity": 1.0, "unit": "piece",
                 "unit_price_cents": 100, "vat_rate_bp": 2100}
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_and_get_invoice(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)
    payload = {
        "customer_id": customer["id"],
        "issue_date": "2026-04-01",
        "payment_terms_days": 30,
        "lines": [
            {"description": "x", "quantity": 1.0, "unit": "piece",
             "unit_price_cents": 100, "vat_rate_bp": 2100}
        ],
    }
    created = (await client.post("/api/v1/invoices/", json=payload, headers=headers)).json()

    listing = await client.get("/api/v1/invoices/", headers=headers)
    assert listing.status_code == 200
    items = listing.json()["data"]
    assert len(items) == 1
    assert items[0]["id"] == created["id"]

    one = await client.get(f"/api/v1/invoices/{created['id']}", headers=headers)
    assert one.status_code == 200
    assert one.json()["invoice_number"] == created["invoice_number"]
    assert len(one.json()["lines"]) == 1


@pytest.mark.asyncio
async def test_invoices_scoped_per_owner(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner1@example.com")
    h2 = await _auth(client, "owner2@example.com")
    c1 = await _make_customer(client, h1)
    payload = {
        "customer_id": c1["id"],
        "issue_date": "2026-04-01",
        "payment_terms_days": 30,
        "lines": [
            {"description": "x", "quantity": 1.0, "unit": "piece",
             "unit_price_cents": 100, "vat_rate_bp": 2100}
        ],
    }
    created = (await client.post("/api/v1/invoices/", json=payload, headers=h1)).json()

    other = await client.get(f"/api/v1/invoices/{created['id']}", headers=h2)
    assert other.status_code == 404

    listing = await client.get("/api/v1/invoices/", headers=h2)
    assert listing.json()["data"] == []
