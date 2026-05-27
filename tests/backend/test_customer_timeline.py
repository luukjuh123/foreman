"""Tests for GET /api/v1/customers/{id}/timeline endpoint."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

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

    app.dependency_overrides[get_db] = override_get_db
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "timeline@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_customer(client: AsyncClient, headers: dict, name: str = "Klant BV") -> str:
    resp = await client.post(
        "/api/v1/customers/",
        json={"name": name, "email": "klant@example.nl"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Basic endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeline_empty_for_new_customer(client):
    """New customer with no events returns an empty timeline."""
    headers = await _auth_headers(client)
    cid = await _create_customer(client, headers)

    resp = await client.get(f"/api/v1/customers/{cid}/timeline", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []
    assert data["offset"] == 0
    assert data["limit"] == 20


@pytest.mark.asyncio
async def test_timeline_returns_404_for_unknown_customer(client):
    headers = await _auth_headers(client)
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/customers/{fake_id}/timeline", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_timeline_requires_auth(client):
    # HTTPBearer returns 403 when no credentials are provided.
    resp = await client.get(f"/api/v1/customers/{uuid.uuid4()}/timeline")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeline_pagination_params(client):
    """offset and limit query params are reflected in the response."""
    headers = await _auth_headers(client)
    cid = await _create_customer(client, headers)

    resp = await client.get(
        f"/api/v1/customers/{cid}/timeline?offset=5&limit=10",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["offset"] == 5
    assert data["limit"] == 10


@pytest.mark.asyncio
async def test_timeline_limit_capped_at_100(client):
    """limit > 100 is rejected with 422 (FastAPI validation enforces le=100)."""
    headers = await _auth_headers(client)
    cid = await _create_customer(client, headers)

    resp = await client.get(
        f"/api/v1/customers/{cid}/timeline?limit=999",
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Event type filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeline_filter_by_event_type_unknown_is_empty(client):
    """Filtering by a non-existent event type yields empty results."""
    headers = await _auth_headers(client)
    cid = await _create_customer(client, headers)

    resp = await client.get(
        f"/api/v1/customers/{cid}/timeline?event_type=invoice_sent",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_timeline_invalid_event_type_returns_422(client):
    """An unrecognised event_type value should be rejected with 422."""
    headers = await _auth_headers(client)
    cid = await _create_customer(client, headers)

    resp = await client.get(
        f"/api/v1/customers/{cid}/timeline?event_type=not_a_real_type",
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeline_response_schema_fields(client):
    """Even with no events the response must have all required top-level keys."""
    headers = await _auth_headers(client)
    cid = await _create_customer(client, headers)

    resp = await client.get(f"/api/v1/customers/{cid}/timeline", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) >= {"items", "total", "offset", "limit"}


@pytest.mark.asyncio
async def test_timeline_event_schema_fields(client, app_with_db):
    """Each event item must expose the required keys."""
    from app.core.database import get_db as _get_db
    from app.models.notification import Notification
    from app.models.user import User
    from sqlalchemy import select

    headers = await _auth_headers(client, email="schema@example.com")
    cid = await _create_customer(client, headers, name="Schema Test BV")

    # Seed a notification via DB — use the app fixture's override.
    db_override = app_with_db.dependency_overrides[_get_db]
    async for db in db_override():
        result = await db.execute(select(User).where(User.email == "schema@example.com"))
        user = result.scalar_one()

        notif = Notification(
            user_id=user.id,
            type="email_sent",
            title="Welkom e-mail",
            body="Bedankt voor uw opdracht.",
            data={"customer_id": str(cid)},
            channels_dispatched=["email"],
        )
        db.add(notif)
        await db.commit()
        break

    resp = await client.get(f"/api/v1/customers/{cid}/timeline", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    event = items[0]
    assert "event_type" in event
    assert "timestamp" in event
    assert "title" in event
    assert "description" in event
    assert "metadata" in event
    assert "id" in event
