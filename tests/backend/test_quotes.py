"""Tests for the Quote model, VAT math, status machine, and router CRUD."""

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
        json={"email": email, "name": "Offerte Boss", "password": "supersecret"},
    )
    assert resp.status_code in (200, 201), resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_customer(client: AsyncClient, headers: dict) -> dict:
    resp = await client.post(
        "/api/v1/invoices/customers",
        json={
            "name": "Bouw B.V.",
            "email": "info@bouw.example",
            "kvk_number": "12345678",
            "address_line1": "Bouwlaan 1",
            "postal_code": "1011AA",
            "city": "Amsterdam",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _line(description: str = "Fundament", quantity: float = 2.0, unit_price_cents: int = 50000, vat_rate_bp: int = 2100) -> dict:
    return {
        "description": description,
        "quantity": quantity,
        "unit": "stuks",
        "unit_price_cents": unit_price_cents,
        "vat_rate_bp": vat_rate_bp,
    }


# ---------------------------------------------------------------------------
# Pure-function tests for quote VAT totals
# ---------------------------------------------------------------------------


def test_compute_line_totals_21pct() -> None:
    from app.services.quotes.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=2.0, unit_price_cents=50000, vat_rate_bp=2100)
    assert net == 100000
    assert vat == 21000


def test_compute_line_totals_9pct() -> None:
    from app.services.quotes.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=1.0, unit_price_cents=10000, vat_rate_bp=900)
    assert net == 10000
    assert vat == 900


def test_compute_line_totals_zero_vat() -> None:
    from app.services.quotes.totals import compute_line_totals

    net, vat = compute_line_totals(quantity=3.0, unit_price_cents=1000, vat_rate_bp=0)
    assert net == 3000
    assert vat == 0


def test_invalid_vat_rate_rejected() -> None:
    from app.services.quotes.totals import compute_line_totals

    with pytest.raises(ValueError, match="Unsupported VAT rate"):
        compute_line_totals(quantity=1.0, unit_price_cents=1000, vat_rate_bp=1500)


# ---------------------------------------------------------------------------
# Quote numbering
# ---------------------------------------------------------------------------


def test_format_quote_number() -> None:
    from app.services.quotes.numbering import format_quote_number

    assert format_quote_number(2026, 1) == "OFF-2026-0001"
    assert format_quote_number(2026, 42) == "OFF-2026-0042"


# ---------------------------------------------------------------------------
# Status machine
# ---------------------------------------------------------------------------


def test_legal_transitions() -> None:
    from app.services.quotes.status import is_legal_transition

    assert is_legal_transition("draft", "sent") is True
    assert is_legal_transition("draft", "rejected") is True
    assert is_legal_transition("sent", "accepted") is True
    assert is_legal_transition("sent", "rejected") is True
    assert is_legal_transition("sent", "expired") is True
    assert is_legal_transition("accepted", "rejected") is False
    assert is_legal_transition("rejected", "accepted") is False


def test_apply_transition_sets_sent_at() -> None:
    from datetime import UTC, datetime

    from app.models.quote import Quote
    from app.services.quotes.status import apply_transition

    quote = Quote(status="draft", owner_id=__import__("uuid").uuid4(), customer_id=__import__("uuid").uuid4(), quote_number="OFF-2026-0001")
    apply_transition(quote, "sent")
    assert quote.status == "sent"
    assert quote.sent_at is not None


def test_apply_transition_sets_accepted_at() -> None:
    from app.models.quote import Quote
    from app.services.quotes.status import apply_transition

    quote = Quote(status="sent", owner_id=__import__("uuid").uuid4(), customer_id=__import__("uuid").uuid4(), quote_number="OFF-2026-0001")
    apply_transition(quote, "accepted")
    assert quote.status == "accepted"
    assert quote.accepted_at is not None


def test_illegal_transition_raises() -> None:
    from app.models.quote import Quote
    from app.services.quotes.status import apply_transition

    quote = Quote(status="accepted", owner_id=__import__("uuid").uuid4(), customer_id=__import__("uuid").uuid4(), quote_number="OFF-2026-0001")
    with pytest.raises(ValueError, match="Illegal transition"):
        apply_transition(quote, "draft")


# ---------------------------------------------------------------------------
# Router CRUD tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_quote(client: AsyncClient) -> None:
    headers = await _auth(client)
    customer = await _make_customer(client, headers)

    resp = await client.post(
        "/api/v1/quotes/",
        json={
            "customer_id": customer["id"],
            "valid_until": "2026-12-31",
            "notes": "Offerte voor verbouwing",
            "lines": [_line()],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["quote_number"].startswith("OFF-")
    assert data["status"] == "draft"
    assert data["subtotal_cents"] == 100000  # 2 * 50000
    assert data["vat_total_cents"] == 21000
    assert data["total_cents"] == 121000
    assert len(data["lines"]) == 1


@pytest.mark.anyio
async def test_list_quotes_empty(client: AsyncClient) -> None:
    headers = await _auth(client, "list_empty@example.com")
    resp = await client.get("/api/v1/quotes/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["data"] == []
    assert data["total"] == 0


@pytest.mark.anyio
async def test_list_quotes_with_status_filter(client: AsyncClient) -> None:
    headers = await _auth(client, "filter@example.com")
    customer = await _make_customer(client, headers)

    # Create two quotes
    await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    r2 = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    q2_id = r2.json()["id"]

    # Transition second quote to sent
    await client.post(
        f"/api/v1/quotes/{q2_id}/status",
        json={"status": "sent"},
        headers=headers,
    )

    resp = await client.get("/api/v1/quotes/?status=draft", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


@pytest.mark.anyio
async def test_get_quote(client: AsyncClient) -> None:
    headers = await _auth(client, "get@example.com")
    customer = await _make_customer(client, headers)

    create_resp = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    quote_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/quotes/{quote_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == quote_id


@pytest.mark.anyio
async def test_get_quote_not_found(client: AsyncClient) -> None:
    headers = await _auth(client, "notfound@example.com")
    resp = await client.get(f"/api/v1/quotes/{__import__('uuid').uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_quote(client: AsyncClient) -> None:
    headers = await _auth(client, "update@example.com")
    customer = await _make_customer(client, headers)

    create_resp = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "notes": "Oud", "lines": [_line()]},
        headers=headers,
    )
    quote_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/quotes/{quote_id}",
        json={"notes": "Bijgewerkt", "lines": [_line("Dakwerk", 1.0, 75000, 2100)]},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["notes"] == "Bijgewerkt"
    assert data["total_cents"] == 75000 + 15750  # 75000 * 1.21


@pytest.mark.anyio
async def test_update_non_draft_quote_rejected(client: AsyncClient) -> None:
    headers = await _auth(client, "update_sent@example.com")
    customer = await _make_customer(client, headers)

    create_resp = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    quote_id = create_resp.json()["id"]

    # Move to sent
    await client.post(f"/api/v1/quotes/{quote_id}/status", json={"status": "sent"}, headers=headers)

    # Try to update sent quote
    resp = await client.put(
        f"/api/v1/quotes/{quote_id}",
        json={"notes": "Proberen te wijzigen"},
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_delete_quote(client: AsyncClient) -> None:
    headers = await _auth(client, "delete@example.com")
    customer = await _make_customer(client, headers)

    create_resp = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    quote_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/quotes/{quote_id}", headers=headers)
    assert resp.status_code == 204

    # Should be gone
    resp2 = await client.get(f"/api/v1/quotes/{quote_id}", headers=headers)
    assert resp2.status_code == 404


# ---------------------------------------------------------------------------
# Status transition tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_status_transition_draft_to_sent(client: AsyncClient) -> None:
    headers = await _auth(client, "trans1@example.com")
    customer = await _make_customer(client, headers)

    cr = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    qid = cr.json()["id"]

    resp = await client.post(f"/api/v1/quotes/{qid}/status", json={"status": "sent"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"
    assert resp.json()["sent_at"] is not None


@pytest.mark.anyio
async def test_status_transition_sent_to_accepted(client: AsyncClient) -> None:
    headers = await _auth(client, "trans2@example.com")
    customer = await _make_customer(client, headers)

    cr = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    qid = cr.json()["id"]

    await client.post(f"/api/v1/quotes/{qid}/status", json={"status": "sent"}, headers=headers)
    resp = await client.post(f"/api/v1/quotes/{qid}/status", json={"status": "accepted"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    assert resp.json()["accepted_at"] is not None


@pytest.mark.anyio
async def test_illegal_status_transition_rejected(client: AsyncClient) -> None:
    headers = await _auth(client, "trans3@example.com")
    customer = await _make_customer(client, headers)

    cr = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    qid = cr.json()["id"]

    # draft -> accepted is not a legal transition
    resp = await client.post(f"/api/v1/quotes/{qid}/status", json={"status": "accepted"}, headers=headers)
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Convert to project
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_convert_quote_to_project(client: AsyncClient) -> None:
    headers = await _auth(client, "convert@example.com")
    customer = await _make_customer(client, headers)

    cr = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    qid = cr.json()["id"]

    # Move to sent first
    await client.post(f"/api/v1/quotes/{qid}/status", json={"status": "sent"}, headers=headers)

    # Convert
    resp = await client.post(f"/api/v1/quotes/{qid}/convert", headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "accepted"
    assert data["project_id"] is not None


@pytest.mark.anyio
async def test_convert_draft_quote_rejected(client: AsyncClient) -> None:
    headers = await _auth(client, "convert_draft@example.com")
    customer = await _make_customer(client, headers)

    cr = await client.post(
        "/api/v1/quotes/",
        json={"customer_id": customer["id"], "lines": [_line()]},
        headers=headers,
    )
    qid = cr.json()["id"]

    resp = await client.post(f"/api/v1/quotes/{qid}/convert", headers=headers)
    assert resp.status_code == 409
