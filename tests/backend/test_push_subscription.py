"""Tests for push subscription API endpoints and VAPID key endpoint."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.push_subscription import PushSubscription

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
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _register_and_login(client: AsyncClient, email: str = "push@example.com") -> str:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "name": "Push User"},
    )
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _sub_payload(endpoint: str = "https://push.example.com/sub/abc") -> dict:
    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtBSGwR-OBnA3nFJKmJDKmQ",
            "auth": "tBHItJI5svbpez7KI4CCXg",
        },
    }


@pytest.mark.asyncio
async def test_vapid_key_no_auth_required(client):
    """GET /api/v1/push/vapid-key returns the public key without authentication."""
    resp = await client.get("/api/v1/push/vapid-key")
    assert resp.status_code == 200
    data = resp.json()
    assert "public_key" in data


@pytest.mark.asyncio
async def test_subscribe_creates_record(app_with_db, client):
    """POST /api/v1/push/subscribe stores subscription for authenticated user."""
    _, session_factory = app_with_db
    token = await _register_and_login(client)

    payload = _sub_payload()
    resp = await client.post(
        "/api/v1/push/subscribe",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["endpoint"] == payload["endpoint"]

    async with session_factory() as session:
        result = await session.execute(
            select(PushSubscription).where(PushSubscription.endpoint == payload["endpoint"])
        )
        sub = result.scalar_one_or_none()
        assert sub is not None
        assert sub.p256dh == payload["keys"]["p256dh"]
        assert sub.auth == payload["keys"]["auth"]


@pytest.mark.asyncio
async def test_subscribe_upserts_on_duplicate_endpoint(app_with_db, client):
    """POST /api/v1/push/subscribe twice with same endpoint succeeds (upsert)."""
    token = await _register_and_login(client, email="push2@example.com")
    payload = _sub_payload(endpoint="https://push.example.com/sub/dup")

    resp1 = await client.post(
        "/api/v1/push/subscribe",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/api/v1/push/subscribe",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 201


@pytest.mark.asyncio
async def test_unsubscribe_removes_record(app_with_db, client):
    """DELETE /api/v1/push/unsubscribe removes the subscription record."""
    _, session_factory = app_with_db
    token = await _register_and_login(client, email="push3@example.com")
    payload = _sub_payload(endpoint="https://push.example.com/sub/del")

    await client.post(
        "/api/v1/push/subscribe",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = await client.request(
        "DELETE",
        "/api/v1/push/unsubscribe",
        json={"endpoint": payload["endpoint"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    async with session_factory() as session:
        result = await session.execute(
            select(PushSubscription).where(PushSubscription.endpoint == payload["endpoint"])
        )
        sub = result.scalar_one_or_none()
        assert sub is None


@pytest.mark.asyncio
async def test_unsubscribe_nonexistent_endpoint_is_204(client):
    """DELETE /api/v1/push/unsubscribe on an unknown endpoint returns 204 (idempotent)."""
    token = await _register_and_login(client, email="push4@example.com")
    resp = await client.request(
        "DELETE",
        "/api/v1/push/unsubscribe",
        json={"endpoint": "https://push.example.com/sub/ghost"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_subscribe_requires_auth(client):
    """POST /api/v1/push/subscribe returns 401/403 without Authorization header."""
    resp = await client.post("/api/v1/push/subscribe", json=_sub_payload())
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_unsubscribe_requires_auth(client):
    """DELETE /api/v1/push/unsubscribe returns 401/403 without Authorization header."""
    resp = await client.request(
        "DELETE",
        "/api/v1/push/unsubscribe",
        json={"endpoint": "https://push.example.com/sub/none"},
    )
    assert resp.status_code in (401, 403)
