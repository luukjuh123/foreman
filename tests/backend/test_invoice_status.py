"""Tests for invoice status state machine and overdue auto-detection."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
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
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "status@example.com") -> dict:
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "X", "password": "supersecret"},
    )
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


async def _make_invoice(
    client: AsyncClient,
    headers: dict,
    *,
    issue_date: str = "2026-04-01",
    payment_terms_days: int = 30,
) -> dict:
    customer = await client.post(
        "/api/v1/invoices/customers",
        json={"name": "Cust", "country_code": "NL"},
        headers=headers,
    )
    inv = await client.post(
        "/api/v1/invoices/",
        json={
            "customer_id": customer.json()["id"],
            "issue_date": issue_date,
            "payment_terms_days": payment_terms_days,
            "lines": [
                {"description": "x", "quantity": 1.0, "unit": "piece",
                 "unit_price_cents": 100, "vat_rate_bp": 2100}
            ],
        },
        headers=headers,
    )
    return inv.json()


# ---------------------------------------------------------------------------
# Pure state-machine tests
# ---------------------------------------------------------------------------


def test_legal_transitions() -> None:
    from app.services.invoices.status import is_legal_transition

    assert is_legal_transition("draft", "sent")
    assert is_legal_transition("draft", "cancelled")
    assert is_legal_transition("sent", "paid")
    assert is_legal_transition("sent", "overdue")
    assert is_legal_transition("sent", "cancelled")
    assert is_legal_transition("overdue", "paid")


def test_illegal_transitions() -> None:
    from app.services.invoices.status import is_legal_transition

    # Cannot skip from draft to paid
    assert not is_legal_transition("draft", "paid")
    assert not is_legal_transition("draft", "overdue")
    # Paid is terminal
    assert not is_legal_transition("paid", "sent")
    assert not is_legal_transition("paid", "draft")
    assert not is_legal_transition("paid", "cancelled")
    # Cancelled is terminal
    assert not is_legal_transition("cancelled", "sent")
    # Same-state is not a transition
    assert not is_legal_transition("draft", "draft")
    # Unknown states
    assert not is_legal_transition("draft", "foo")


# ---------------------------------------------------------------------------
# Transition endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transition_draft_to_sent_sets_sent_at(client: AsyncClient) -> None:
    headers = await _auth(client)
    inv = await _make_invoice(client, headers)

    resp = await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "sent"
    assert data["sent_at"] is not None
    assert data["paid_at"] is None


@pytest.mark.asyncio
async def test_transition_sent_to_paid_sets_paid_at(client: AsyncClient) -> None:
    headers = await _auth(client)
    inv = await _make_invoice(client, headers)
    await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    resp = await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "paid"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "paid"
    assert data["paid_at"] is not None


@pytest.mark.asyncio
async def test_transition_illegal_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    inv = await _make_invoice(client, headers)
    resp = await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "paid"},
        headers=headers,
    )
    assert resp.status_code == 409
    assert "transition" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_transition_unknown_status_rejected(client: AsyncClient) -> None:
    headers = await _auth(client)
    inv = await _make_invoice(client, headers)
    resp = await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "shipped"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_transition_requires_ownership(client: AsyncClient) -> None:
    h1 = await _auth(client, "u1@example.com")
    h2 = await _auth(client, "u2@example.com")
    inv = await _make_invoice(client, h1)
    resp = await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "sent"},
        headers=h2,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Overdue sweep
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sweep_marks_sent_invoices_past_due(app_with_db) -> None:
    from app.models.invoice import Invoice
    from app.services.invoices.status import sweep_overdue

    _, session_factory = app_with_db
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db[0]), base_url="http://test"
    ) as client:
        headers = await _auth(client)
        # Past-due invoice (issued long ago)
        past = await _make_invoice(
            client, headers, issue_date="2025-01-01", payment_terms_days=30
        )
        # Mark it as sent
        await client.post(
            f"/api/v1/invoices/{past['id']}/transition",
            json={"status": "sent"},
            headers=headers,
        )
        # Not-yet-due invoice
        future = await _make_invoice(
            client, headers, issue_date="2099-01-01", payment_terms_days=30
        )
        await client.post(
            f"/api/v1/invoices/{future['id']}/transition",
            json={"status": "sent"},
            headers=headers,
        )

    async with session_factory() as db:
        n = await sweep_overdue(db, as_of=date(2025, 6, 1))
        await db.commit()
        assert n == 1

        rows = (await db.execute(select(Invoice))).scalars().all()
        statuses = {r.invoice_number: r.status for r in rows}
        # past invoice → overdue, future invoice → still sent
        assert any(s == "overdue" for s in statuses.values())
        assert any(s == "sent" for s in statuses.values())


@pytest.mark.asyncio
async def test_sweep_endpoint_returns_count(client: AsyncClient) -> None:
    headers = await _auth(client)
    inv = await _make_invoice(client, headers, issue_date="2025-01-01")
    await client.post(
        f"/api/v1/invoices/{inv['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/invoices/sweep-overdue",
        json={"as_of": "2025-06-01"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    # Second call: nothing to do (already overdue)
    resp2 = await client.post(
        "/api/v1/invoices/sweep-overdue",
        json={"as_of": "2025-06-01"},
        headers=headers,
    )
    assert resp2.json()["updated"] == 0


@pytest.mark.asyncio
async def test_sweep_ignores_paid_invoices(app_with_db) -> None:
    from app.models.invoice import Invoice
    from app.services.invoices.status import sweep_overdue

    app, session_factory = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _auth(client)
        inv = await _make_invoice(client, headers, issue_date="2025-01-01")
        # draft → sent → paid
        await client.post(
            f"/api/v1/invoices/{inv['id']}/transition",
            json={"status": "sent"},
            headers=headers,
        )
        await client.post(
            f"/api/v1/invoices/{inv['id']}/transition",
            json={"status": "paid"},
            headers=headers,
        )

    async with session_factory() as db:
        n = await sweep_overdue(db, as_of=date(2025, 6, 1))
        await db.commit()
        assert n == 0
        row = (await db.execute(select(Invoice))).scalar_one()
        assert row.status == "paid"


@pytest.mark.asyncio
async def test_list_invoices_filter_by_status(client: AsyncClient) -> None:
    headers = await _auth(client)
    a = await _make_invoice(client, headers)
    await _make_invoice(client, headers)
    await client.post(
        f"/api/v1/invoices/{a['id']}/transition",
        json={"status": "sent"},
        headers=headers,
    )
    resp = await client.get("/api/v1/invoices/?status=sent", headers=headers)
    items = resp.json()["data"]
    assert len(items) == 1
    assert items[0]["status"] == "sent"
