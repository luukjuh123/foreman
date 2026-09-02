"""Tests for customer communication timeline endpoints.

TDD: these tests are written first and drive the implementation.
"""

from __future__ import annotations

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


async def _auth(client: AsyncClient, email: str = "timeline@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Timeline User", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_customer(client: AsyncClient, headers: dict, name: str = "Klant BV") -> str:
    resp = await client.post("/api/v1/customers/", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Timeline endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeline_empty_for_new_customer(client):
    """A newly created customer has an empty timeline."""
    headers = await _auth(client)
    cid = await _make_customer(client, headers)
    resp = await client.get(f"/api/v1/customers/{cid}/timeline", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_timeline_returns_recorded_events(client):
    """Events recorded via the helper appear in the timeline."""
    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)

    # Record an event directly via service helper
    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="invoice_sent",
            description="Invoice #2026-001 sent",
            reference_id=uuid.uuid4(),
            metadata={"invoice_number": "2026-001", "amount_cents": 50000},
        )
        await db.commit()

    resp = await client.get(f"/api/v1/customers/{cid}/timeline", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    event = data["items"][0]
    assert event["event_type"] == "invoice_sent"
    assert event["description"] == "Invoice #2026-001 sent"
    assert event["customer_id"] == cid
    assert "id" in event
    assert "timestamp" in event
    assert event["metadata"]["invoice_number"] == "2026-001"


@pytest.mark.asyncio
async def test_timeline_sorted_descending(client):
    """Timeline returns events newest-first."""
    from datetime import UTC, datetime, timedelta

    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)

    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="email_sent",
            description="First email",
            timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        )
        await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="project_update",
            description="Project kicked off",
            timestamp=datetime(2026, 1, 10, tzinfo=UTC),
        )
        await db.commit()

    resp = await client.get(f"/api/v1/customers/{cid}/timeline", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    # Newest first
    assert items[0]["description"] == "Project kicked off"
    assert items[1]["description"] == "First email"


@pytest.mark.asyncio
async def test_timeline_filter_by_event_type(client):
    """event_type query parameter filters results."""
    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)

    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        await record_event(db, customer_id=uuid.UUID(cid), event_type="invoice_sent", description="Invoice sent")
        await record_event(db, customer_id=uuid.UUID(cid), event_type="email_sent", description="Email sent")
        await record_event(db, customer_id=uuid.UUID(cid), event_type="invoice_sent", description="Invoice 2 sent")
        await db.commit()

    resp = await client.get(f"/api/v1/customers/{cid}/timeline?event_type=invoice_sent", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert all(e["event_type"] == "invoice_sent" for e in data["items"])


@pytest.mark.asyncio
async def test_timeline_pagination(client):
    """Pagination via limit/offset works correctly."""
    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)

    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        for i in range(5):
            await record_event(
                db,
                customer_id=uuid.UUID(cid),
                event_type="email_sent",
                description=f"Email {i}",
            )
        await db.commit()

    # First page
    resp = await client.get(f"/api/v1/customers/{cid}/timeline?limit=2&offset=0", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2

    # Second page
    resp2 = await client.get(f"/api/v1/customers/{cid}/timeline?limit=2&offset=2", headers=headers)
    data2 = resp2.json()
    assert len(data2["items"]) == 2
    # Pages must not overlap
    ids_page1 = {e["id"] for e in data["items"]}
    ids_page2 = {e["id"] for e in data2["items"]}
    assert ids_page1.isdisjoint(ids_page2)


@pytest.mark.asyncio
async def test_timeline_404_for_unknown_customer(client):
    """Timeline for non-existent customer returns 404."""
    headers = await _auth(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/customers/{fake_id}/timeline", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_timeline_invalid_event_type(client):
    """Passing an unknown event_type returns 422."""
    headers = await _auth(client)
    cid = await _make_customer(client, headers)
    resp = await client.get(f"/api/v1/customers/{cid}/timeline?event_type=not_valid", headers=headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Summary endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_summary_empty_customer(client):
    """Summary for a customer with no invoices/projects returns zeros."""
    headers = await _auth(client)
    cid = await _make_customer(client, headers)
    resp = await client.get(f"/api/v1/customers/{cid}/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_invoices"] == 0
    assert data["total_projects"] == 0
    assert data["total_revenue_cents"] == 0
    assert data["last_interaction_at"] is None


@pytest.mark.asyncio
async def test_summary_reflects_events(client):
    """Summary reflects recorded invoice and project events."""
    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)

    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="invoice_sent",
            description="Invoice #1",
            metadata={"amount_cents": 100000},
        )
        await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="invoice_sent",
            description="Invoice #2",
            metadata={"amount_cents": 50000},
        )
        await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="project_update",
            description="Project started",
            reference_id=uuid.uuid4(),
        )
        await db.commit()

    resp = await client.get(f"/api/v1/customers/{cid}/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_invoices"] == 2
    assert data["total_projects"] == 1
    assert data["total_revenue_cents"] == 150000
    assert data["last_interaction_at"] is not None


@pytest.mark.asyncio
async def test_summary_404_for_unknown_customer(client):
    """Summary for non-existent customer returns 404."""
    headers = await _auth(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/customers/{fake_id}/summary", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# record_event helper — unit tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_event_all_fields(client):
    """record_event stores all provided fields correctly."""
    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)
    ref = uuid.uuid4()

    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        event = await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="report_shared",
            description="Q1 report shared",
            reference_id=ref,
            metadata={"report_title": "Q1 2026"},
        )
        await db.commit()

    assert event.customer_id == uuid.UUID(cid)
    assert event.event_type == "report_shared"
    assert event.description == "Q1 report shared"
    assert event.reference_id == ref
    assert event.metadata["report_title"] == "Q1 2026"


@pytest.mark.asyncio
async def test_record_event_minimal(client):
    """record_event works with only required fields."""
    from app.core.database import get_db as _get_db
    from app.services.customer_events import record_event

    headers = await _auth(client)
    cid = await _make_customer(client, headers)

    app = client._transport.app  # type: ignore[attr-defined]
    async with app.dependency_overrides[_get_db]() as db:
        event = await record_event(
            db,
            customer_id=uuid.UUID(cid),
            event_type="email_sent",
            description="Welkom email",
        )
        await db.commit()

    assert event.id is not None
    assert event.reference_id is None
    assert event.metadata is None
