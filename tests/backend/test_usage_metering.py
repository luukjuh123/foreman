"""Tests for usage metering: project/user/storage counters per account."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.usage import UsageCounter

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
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _register(client, email="user@example.com"):
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _upgrade_to_paid(session_factory, email="user@example.com"):
    from app.models.subscription import Subscription, SubscriptionTier
    from app.models.user import User

    async with session_factory() as s:
        user = (await s.execute(select(User).where(User.email == email))).scalar_one()
        sub = (
            await s.execute(select(Subscription).where(Subscription.owner_id == user.id))
        ).scalar_one()
        sub.tier = SubscriptionTier.PRO.value
        sub.project_limit = None
        await s.commit()


# ---------------------------------------------------------------------------
# Usage counter provisioned on registration
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_creates_usage_counter(app_with_db, client):
    await _register(client)
    sf = app_with_db.state.test_session_factory
    async with sf() as s:
        counter = (await s.execute(select(UsageCounter))).scalar_one()
        assert counter.project_count == 0
        assert counter.user_count == 1
        assert counter.storage_bytes == 0


# ---------------------------------------------------------------------------
# Counter bumps on project create/delete
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_project_create_increments_usage(app_with_db, client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    await _upgrade_to_paid(app_with_db.state.test_session_factory)
    r = await client.post("/api/v1/projects/", json={"name": "A"}, headers=headers)
    assert r.status_code == 201
    r2 = await client.post("/api/v1/projects/", json={"name": "B"}, headers=headers)
    assert r2.status_code == 201

    sf = app_with_db.state.test_session_factory
    async with sf() as s:
        counter = (await s.execute(select(UsageCounter))).scalar_one()
        assert counter.project_count == 2


@pytest.mark.asyncio
async def test_project_delete_decrements_usage(app_with_db, client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    await _upgrade_to_paid(app_with_db.state.test_session_factory)
    r = await client.post("/api/v1/projects/", json={"name": "A"}, headers=headers)
    project_id = r.json()["id"]
    rd = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert rd.status_code == 204

    sf = app_with_db.state.test_session_factory
    async with sf() as s:
        counter = (await s.execute(select(UsageCounter))).scalar_one()
        assert counter.project_count == 0


# ---------------------------------------------------------------------------
# Usage endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_usage(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    r = await client.get("/api/v1/billing/usage", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project_count"] == 0
    assert body["user_count"] == 1
    assert body["storage_bytes"] == 0


# ---------------------------------------------------------------------------
# Service-level helpers
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_record_storage_bytes(app_with_db, client):
    from app.services.billing.usage import add_storage_bytes

    await _register(client)
    sf = app_with_db.state.test_session_factory
    async with sf() as s:
        from app.models.user import User

        user = (await s.execute(select(User))).scalar_one()
        await add_storage_bytes(user.id, 1024, s)
        await s.commit()

    async with sf() as s:
        counter = (await s.execute(select(UsageCounter))).scalar_one()
        assert counter.storage_bytes == 1024
