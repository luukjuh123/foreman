"""Tests for invoice payment auto-reconciliation via Mollie webhooks.

Covers:
- Reconciliation service unit tests (match by amount + reference)
- POST /api/webhooks/mollie/invoices — happy path and edge cases
- GET /api/invoices/payments/unmatched — listing unmatched payments
- Journal entry creation on reconciliation
- Unmatched payment surfacing when no invoice found
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, date, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.finance import Account, JournalEntry
from app.models.invoice import Customer, Invoice, InvoiceCounter
from app.models.payment_reconciliation import UnmatchedPayment
from app.services.billing.providers import get_payment_provider
from app.services.billing.providers.fake import FakePaymentProvider

TEST_DB_URL = "sqlite+aiosqlite://"
WEBHOOK_SECRET = "test-invoice-webhook-secret"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    fake = FakePaymentProvider(webhook_secret=WEBHOOK_SECRET)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_payment_provider] = lambda: fake
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        ac._app = app_with_db
        yield ac


async def _register(client: AsyncClient, email: str = "owner@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test Owner", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_accounts(client: AsyncClient, headers: dict) -> dict[str, str]:
    resp = await client.post("/api/v1/financials/accounts/seed", headers=headers)
    assert resp.status_code in (200, 201), resp.text
    return {a["code"]: a["id"] for a in resp.json()}


async def _create_invoice(
    client: AsyncClient,
    headers: dict,
    total_cents: int = 12100,
    invoice_number: str | None = None,
) -> dict:
    """Create a customer + invoice with total_cents. Returns invoice dict."""
    cust = await client.post(
        "/api/v1/invoices/customers",
        json={"name": "Test Klant", "email": "klant@example.com"},
        headers=headers,
    )
    assert cust.status_code == 201, cust.text
    customer_id = cust.json()["id"]

    # Unit price such that total == total_cents (21% BTW → net = total / 1.21)
    # Use net=10000, vat=2100 → total=12100 as default
    net = 10000
    vat = 2100
    resp = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer_id,
            "issue_date": "2026-01-01",
            "payment_terms_days": 30,
            "lines": [
                {
                    "description": "Werkzaamheden",
                    "quantity": 1.0,
                    "unit": "piece",
                    "unit_price_cents": net,
                    "vat_rate_bp": 2100,
                }
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    invoice = resp.json()

    # Transition to 'sent' so it can be paid
    tr = await client.post(
        f"/api/v1/invoices/{invoice['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    assert tr.status_code == 200, tr.text
    return tr.json()


def _sign_payload(payload: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Unit tests — reconciliation service (pure logic)
# ---------------------------------------------------------------------------


def test_reconcile_match_by_amount_and_reference():
    """Service finds invoice matching amount + invoice_number as reference."""
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="sent"),
        _make_invoice(invoice_number="2026-002", total_cents=9500, status="sent"),
    ]
    match = find_matching_invoice(invoices, amount_cents=12100, reference="2026-001")
    assert match is not None
    assert match.invoice_number == "2026-001"


def test_reconcile_no_match_wrong_amount():
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="sent"),
    ]
    match = find_matching_invoice(invoices, amount_cents=9999, reference="2026-001")
    assert match is None


def test_reconcile_no_match_wrong_reference():
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="sent"),
    ]
    match = find_matching_invoice(invoices, amount_cents=12100, reference="2026-999")
    assert match is None


def test_reconcile_ignores_already_paid():
    """Already-paid invoices must not be matched again."""
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="paid"),
    ]
    match = find_matching_invoice(invoices, amount_cents=12100, reference="2026-001")
    assert match is None


def test_reconcile_ignores_cancelled():
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="cancelled"),
    ]
    match = find_matching_invoice(invoices, amount_cents=12100, reference="2026-001")
    assert match is None


def test_reconcile_matches_overdue_invoice():
    """Overdue invoices can still be reconciled (payment received late)."""
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="overdue"),
    ]
    match = find_matching_invoice(invoices, amount_cents=12100, reference="2026-001")
    assert match is not None


def test_reconcile_empty_reference_uses_amount_only():
    """When reference is None/empty, match on amount alone (first match wins)."""
    from app.services.invoices.reconciliation import find_matching_invoice

    invoices = [
        _make_invoice(invoice_number="2026-001", total_cents=12100, status="sent"),
        _make_invoice(invoice_number="2026-002", total_cents=12100, status="sent"),
    ]
    match = find_matching_invoice(invoices, amount_cents=12100, reference=None)
    # First matching invoice returned
    assert match is not None
    assert match.total_cents == 12100


def _make_invoice(
    invoice_number: str,
    total_cents: int,
    status: str,
) -> Invoice:
    """Build an in-memory Invoice without a DB session."""
    inv = Invoice()
    inv.id = uuid.uuid4()
    inv.owner_id = uuid.uuid4()
    inv.customer_id = uuid.uuid4()
    inv.invoice_number = invoice_number
    inv.issue_date = date(2026, 1, 1)
    inv.due_date = date(2026, 1, 31)
    inv.payment_terms_days = 30
    inv.currency = "EUR"
    inv.status = status
    inv.subtotal_cents = total_cents
    inv.vat_total_cents = 0
    inv.total_cents = total_cents
    inv.lines = []
    return inv


# ---------------------------------------------------------------------------
# Integration — webhook endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoice_webhook_rejects_missing_signature(client):
    payload = json.dumps({"id": "tr_abc", "amount": {"value": "121.00", "currency": "EUR"}}).encode()
    resp = await client.post("/api/webhooks/mollie/invoices", content=payload)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invoice_webhook_rejects_bad_signature(client):
    payload = json.dumps({"id": "tr_abc", "amount": {"value": "121.00", "currency": "EUR"}}).encode()
    resp = await client.post(
        "/api/webhooks/mollie/invoices",
        content=payload,
        headers={"X-Mollie-Signature": "deadbeef"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invoice_webhook_matched_marks_invoice_paid(client, app_with_db):
    """Webhook payment matching invoice by amount + reference → status becomes 'paid'."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    invoice = await _create_invoice(client, headers, total_cents=12100)
    invoice_number = invoice["invoice_number"]
    invoice_id = invoice["id"]

    payload = json.dumps({
        "id": "tr_invoice_match_001",
        "amount": {"value": "121.00", "currency": "EUR"},
        "description": invoice_number,
        "status": "paid",
    }).encode()
    sig = _sign_payload(payload)
    resp = await client.post(
        "/api/webhooks/mollie/invoices",
        content=payload,
        headers={"X-Mollie-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["matched"] is True

    # Verify invoice status updated to 'paid'
    session_factory = app_with_db.state.test_session_factory
    async with session_factory() as session:
        inv = (await session.execute(select(Invoice).where(Invoice.id == uuid.UUID(invoice_id)))).scalar_one()
        assert inv.status == "paid"
        assert inv.paid_at is not None


@pytest.mark.asyncio
async def test_invoice_webhook_matched_creates_journal_entry(client, app_with_db):
    """On match a balanced double-entry journal entry is created."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    await _seed_accounts(client, headers)
    invoice = await _create_invoice(client, headers, total_cents=12100)
    invoice_number = invoice["invoice_number"]

    payload = json.dumps({
        "id": "tr_invoice_je_001",
        "amount": {"value": "121.00", "currency": "EUR"},
        "description": invoice_number,
        "status": "paid",
    }).encode()
    sig = _sign_payload(payload)
    await client.post(
        "/api/webhooks/mollie/invoices",
        content=payload,
        headers={"X-Mollie-Signature": sig, "Content-Type": "application/json"},
    )

    session_factory = app_with_db.state.test_session_factory
    async with session_factory() as session:
        entries = (
            await session.execute(
                select(JournalEntry).where(JournalEntry.reference == invoice_number)
            )
        ).scalars().all()
        assert len(entries) == 1
        entry = entries[0]
        # Load lines
        from sqlalchemy.orm import selectinload
        entry_loaded = (
            await session.execute(
                select(JournalEntry)
                .where(JournalEntry.id == entry.id)
                .options(selectinload(JournalEntry.lines))
            )
        ).scalar_one()
        total_debit = sum(ln.debit_cents for ln in entry_loaded.lines)
        total_credit = sum(ln.credit_cents for ln in entry_loaded.lines)
        assert total_debit == total_credit == 12100


@pytest.mark.asyncio
async def test_invoice_webhook_unmatched_creates_unmatched_record(client, app_with_db):
    """Webhook payment that cannot be matched → stored as UnmatchedPayment."""
    payload = json.dumps({
        "id": "tr_nomatch_001",
        "amount": {"value": "999.99", "currency": "EUR"},
        "description": "ONBEKEND-REF",
        "status": "paid",
    }).encode()
    sig = _sign_payload(payload)
    resp = await client.post(
        "/api/webhooks/mollie/invoices",
        content=payload,
        headers={"X-Mollie-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["matched"] is False

    session_factory = app_with_db.state.test_session_factory
    async with session_factory() as session:
        records = (await session.execute(select(UnmatchedPayment))).scalars().all()
        assert len(records) == 1
        assert records[0].mollie_payment_id == "tr_nomatch_001"
        assert records[0].amount_cents == 99999


@pytest.mark.asyncio
async def test_invoice_webhook_idempotent(client, app_with_db):
    """Sending the same webhook twice does not double-pay or create duplicate JE."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    await _seed_accounts(client, headers)
    invoice = await _create_invoice(client, headers, total_cents=12100)
    invoice_number = invoice["invoice_number"]

    payload = json.dumps({
        "id": "tr_idempotent_001",
        "amount": {"value": "121.00", "currency": "EUR"},
        "description": invoice_number,
        "status": "paid",
    }).encode()
    sig = _sign_payload(payload)
    headers_w = {"X-Mollie-Signature": sig, "Content-Type": "application/json"}

    r1 = await client.post("/api/webhooks/mollie/invoices", content=payload, headers=headers_w)
    r2 = await client.post("/api/webhooks/mollie/invoices", content=payload, headers=headers_w)
    assert r1.status_code == 200
    assert r2.status_code == 200

    session_factory = app_with_db.state.test_session_factory
    async with session_factory() as session:
        entries = (
            await session.execute(
                select(JournalEntry).where(JournalEntry.reference == invoice_number)
            )
        ).scalars().all()
        # Only one journal entry even after two webhooks
        assert len(entries) == 1


# ---------------------------------------------------------------------------
# Integration — GET /api/invoices/payments/unmatched
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_unmatched_requires_auth(client):
    resp = await client.get("/api/invoices/payments/unmatched")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_unmatched_returns_empty_initially(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.get("/api/invoices/payments/unmatched", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_unmatched_shows_unresolved_payment(client, app_with_db):
    """Unmatched payment stored by webhook is visible in listing endpoint."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    payload = json.dumps({
        "id": "tr_list_001",
        "amount": {"value": "50.00", "currency": "EUR"},
        "description": "UNKNOWN",
        "status": "paid",
    }).encode()
    sig = _sign_payload(payload)
    await client.post(
        "/api/webhooks/mollie/invoices",
        content=payload,
        headers={"X-Mollie-Signature": sig, "Content-Type": "application/json"},
    )

    resp = await client.get("/api/invoices/payments/unmatched", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    ids = [item["mollie_payment_id"] for item in body["data"]]
    assert "tr_list_001" in ids


@pytest.mark.asyncio
async def test_list_unmatched_pagination(client, app_with_db):
    """Pagination params are respected."""
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # Insert 3 unmatched payments
    for i in range(3):
        pl = json.dumps({
            "id": f"tr_page_{i}",
            "amount": {"value": "10.00", "currency": "EUR"},
            "description": f"ref_{i}",
            "status": "paid",
        }).encode()
        sig = _sign_payload(pl)
        await client.post(
            "/api/webhooks/mollie/invoices",
            content=pl,
            headers={"X-Mollie-Signature": sig},
        )

    resp = await client.get("/api/invoices/payments/unmatched?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) <= 2
    assert body["total"] >= 3
