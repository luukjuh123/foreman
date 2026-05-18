"""Tests for the free-tier trial period."""

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import create_app
from app.models.subscription import (
    Subscription,
    SubscriptionStatus,
    SubscriptionTier,
)
from app.services.billing.subscriptions import apply_trial_expiry

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    yield engine, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def app_with_db(db_session):
    _, session_factory = db_session
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield app, session_factory


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


async def _register(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "trial@example.com", "name": "Trial User", "password": "pw123456"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_register_starts_trial_with_unlimited_projects(app_with_db, client):
    _, session_factory = app_with_db
    before = datetime.now(UTC)
    await _register(client)
    async with session_factory() as session:
        sub = (await session.execute(select(Subscription))).scalar_one()
        assert sub.status == SubscriptionStatus.TRIALING.value
        assert sub.tier == SubscriptionTier.FREE.value
        assert sub.project_limit is None
        assert sub.trial_ends_at is not None
        ends = sub.trial_ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=UTC)
        delta = ends - before
        # Allow slack but ensure roughly trial_period_days in the future.
        assert delta >= timedelta(days=settings.trial_period_days - 1)
        assert delta <= timedelta(days=settings.trial_period_days + 1)


@pytest.mark.asyncio
async def test_trial_allows_multiple_projects(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    for i in range(3):
        r = await client.post(
            "/api/v1/projects/", json={"name": f"Trial {i}"}, headers=headers
        )
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_apply_trial_expiry_downgrades_free_tier():
    sub = Subscription(
        owner_id=None,  # not flushed; pure unit
        tier=SubscriptionTier.FREE.value,
        status=SubscriptionStatus.TRIALING.value,
        project_limit=None,
        trial_ends_at=datetime.now(UTC) - timedelta(seconds=1),
    )
    changed = apply_trial_expiry(sub)
    assert changed is True
    assert sub.status == SubscriptionStatus.ACTIVE.value
    assert sub.project_limit == 1


@pytest.mark.asyncio
async def test_apply_trial_expiry_noop_when_in_future():
    sub = Subscription(
        owner_id=None,
        tier=SubscriptionTier.FREE.value,
        status=SubscriptionStatus.TRIALING.value,
        project_limit=None,
        trial_ends_at=datetime.now(UTC) + timedelta(days=5),
    )
    changed = apply_trial_expiry(sub)
    assert changed is False
    assert sub.status == SubscriptionStatus.TRIALING.value
    assert sub.project_limit is None


@pytest.mark.asyncio
async def test_expired_trial_enforces_free_limit_via_endpoint(app_with_db, client):
    _, session_factory = app_with_db
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    # Backdate the trial.
    async with session_factory() as session:
        sub = (await session.execute(select(Subscription))).scalar_one()
        sub.trial_ends_at = datetime.now(UTC) - timedelta(days=1)
        await session.commit()
    # First project allowed.
    r1 = await client.post(
        "/api/v1/projects/", json={"name": "A"}, headers=headers
    )
    assert r1.status_code == 201
    # Second project blocked.
    r2 = await client.post(
        "/api/v1/projects/", json={"name": "B"}, headers=headers
    )
    assert r2.status_code == 402
    # Endpoint now reports the downgraded state.
    resp = await client.get("/api/v1/billing/subscription", headers=headers)
    body = resp.json()
    assert body["status"] == "active"
    assert body["project_limit"] == 1


@pytest.mark.asyncio
async def test_subscription_endpoint_reports_trial_ends_at(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.get("/api/v1/billing/subscription", headers=headers)
    body = resp.json()
    assert body["trial_ends_at"] is not None
    assert body["status"] == "trialing"
