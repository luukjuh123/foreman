"""Tests for the PaymentProvider interface, Mollie integration, and webhooks."""

import hashlib
import hmac
import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.services.billing.providers.base import PaymentProvider
from app.services.billing.providers.fake import FakePaymentProvider
from app.services.billing.providers.mollie import MollieProvider

TEST_DB_URL = "sqlite+aiosqlite://"
WEBHOOK_SECRET = "test-webhook-secret"


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

    from app.services.billing.providers import get_payment_provider

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_payment_provider] = lambda: fake
    app.state.test_session_factory = session_factory
    app.state.test_provider = fake
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        ac._app = app_with_db
        yield ac


async def _register(client: AsyncClient, email: str = "user@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Interface contracts
# ---------------------------------------------------------------------------

def test_payment_provider_is_abstract():
    with pytest.raises(TypeError):
        PaymentProvider()  # type: ignore[abstract]


def test_fake_provider_implements_interface():
    p = FakePaymentProvider()
    assert isinstance(p, PaymentProvider)


def test_mollie_provider_implements_interface():
    p = MollieProvider(api_key="test_key", webhook_secret="secret")
    assert isinstance(p, PaymentProvider)


def test_fake_provider_create_subscription_returns_redirect_url():
    p = FakePaymentProvider()
    res = p.create_subscription(
        customer_email="a@b.com", tier="pro", amount_cents=1999
    )
    assert res.checkout_url.startswith("http")
    assert res.provider_subscription_id
    assert res.provider_customer_id


def test_fake_provider_signature_verification():
    p = FakePaymentProvider(webhook_secret="abc")
    payload = b'{"id":"sub_1","status":"active"}'
    sig = hmac.new(b"abc", payload, hashlib.sha256).hexdigest()
    assert p.verify_webhook_signature(payload, sig)
    assert not p.verify_webhook_signature(payload, "deadbeef")


def test_mollie_verify_signature_uses_hmac_sha256():
    p = MollieProvider(api_key="key", webhook_secret="topsecret")
    payload = b'{"hello":"world"}'
    sig = hmac.new(b"topsecret", payload, hashlib.sha256).hexdigest()
    assert p.verify_webhook_signature(payload, sig)
    assert not p.verify_webhook_signature(payload, "bogus")


# ---------------------------------------------------------------------------
# Checkout endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_checkout_returns_redirect_url(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.post(
        "/api/v1/billing/checkout", json={"tier": "pro"}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "checkout_url" in body
    assert body["checkout_url"].startswith("http")


@pytest.mark.asyncio
async def test_checkout_requires_auth(client):
    resp = await client.post("/api/v1/billing/checkout", json={"tier": "pro"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_checkout_rejects_unknown_tier(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.post(
        "/api/v1/billing/checkout", json={"tier": "ultra-mega"}, headers=headers
    )
    assert resp.status_code == 422 or resp.status_code == 400


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------

def _sign(payload: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


@pytest.mark.asyncio
async def test_webhook_rejects_missing_signature(client):
    resp = await client.post(
        "/api/v1/billing/webhook/mollie", content=b'{"id":"sub_x"}'
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(client):
    payload = b'{"id":"sub_x","status":"active"}'
    resp = await client.post(
        "/api/v1/billing/webhook/mollie",
        content=payload,
        headers={"X-Mollie-Signature": "deadbeef"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_webhook_activates_subscription(client, app_with_db):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    co = await client.post(
        "/api/v1/billing/checkout", json={"tier": "pro"}, headers=headers
    )
    assert co.status_code == 200, co.text
    body = co.json()
    sub_id = body["provider_subscription_id"]

    payload = json.dumps({"id": sub_id, "status": "active"}).encode()
    sig = _sign(payload)
    resp = await client.post(
        "/api/v1/billing/webhook/mollie",
        content=payload,
        headers={"X-Mollie-Signature": sig, "Content-Type": "application/json"},
    )
    assert resp.status_code == 200, resp.text

    session_factory = app_with_db.state.test_session_factory
    async with session_factory() as session:
        sub = (
            await session.execute(select(Subscription).where(Subscription.tier == "pro"))
        ).scalar_one()
        assert sub.status == SubscriptionStatus.ACTIVE.value
        assert sub.tier == SubscriptionTier.PRO.value
        assert sub.provider_subscription_id == sub_id
        assert sub.project_limit is None  # unlimited


@pytest.mark.asyncio
async def test_webhook_cancellation_marks_subscription(client, app_with_db):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    co = await client.post(
        "/api/v1/billing/checkout", json={"tier": "starter"}, headers=headers
    )
    sub_id = co.json()["provider_subscription_id"]
    # Activate first
    p1 = json.dumps({"id": sub_id, "status": "active"}).encode()
    await client.post(
        "/api/v1/billing/webhook/mollie",
        content=p1,
        headers={"X-Mollie-Signature": _sign(p1)},
    )
    # Then cancel
    p2 = json.dumps({"id": sub_id, "status": "cancelled"}).encode()
    r = await client.post(
        "/api/v1/billing/webhook/mollie",
        content=p2,
        headers={"X-Mollie-Signature": _sign(p2)},
    )
    assert r.status_code == 200

    session_factory = app_with_db.state.test_session_factory
    async with session_factory() as session:
        sub = (
            await session.execute(
                select(Subscription).where(Subscription.provider_subscription_id == sub_id)
            )
        ).scalar_one()
        assert sub.status == SubscriptionStatus.CANCELLED.value
