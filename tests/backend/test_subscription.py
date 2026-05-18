"""Tests for the Subscription model and free-tier project limit."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier

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


async def _register(client: AsyncClient, email: str = "user@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_register_creates_free_subscription(app_with_db, client):
    _, session_factory = app_with_db
    await _register(client)
    async with session_factory() as session:
        result = await session.execute(select(Subscription))
        sub = result.scalar_one()
        assert sub.tier == SubscriptionTier.FREE.value
        assert sub.status == SubscriptionStatus.ACTIVE.value
        assert sub.project_limit == 1


@pytest.mark.asyncio
async def test_get_my_subscription(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.get("/api/v1/billing/subscription", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tier"] == "free"
    assert body["status"] == "active"
    assert body["project_limit"] == 1


@pytest.mark.asyncio
async def test_free_tier_allows_one_project(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    resp = await client.post(
        "/api/v1/projects/", json={"name": "First"}, headers=headers
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_free_tier_rejects_second_project(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    r1 = await client.post(
        "/api/v1/projects/", json={"name": "First"}, headers=headers
    )
    assert r1.status_code == 201
    r2 = await client.post(
        "/api/v1/projects/", json={"name": "Second"}, headers=headers
    )
    assert r2.status_code == 402
    assert "limit" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_deleted_project_frees_a_slot(client):
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    r1 = await client.post(
        "/api/v1/projects/", json={"name": "First"}, headers=headers
    )
    assert r1.status_code == 201
    project_id = r1.json()["id"]
    r2 = await client.post(
        "/api/v1/projects/", json={"name": "Second"}, headers=headers
    )
    assert r2.status_code == 402
    rd = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert rd.status_code == 204
    r3 = await client.post(
        "/api/v1/projects/", json={"name": "Third"}, headers=headers
    )
    assert r3.status_code == 201


@pytest.mark.asyncio
async def test_paid_tier_allows_unlimited(app_with_db, client):
    _, session_factory = app_with_db
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    async with session_factory() as session:
        result = await session.execute(select(Subscription))
        sub = result.scalar_one()
        sub.tier = SubscriptionTier.PRO.value
        sub.project_limit = None
        await session.commit()
    for i in range(5):
        r = await client.post(
            "/api/v1/projects/", json={"name": f"P{i}"}, headers=headers
        )
        assert r.status_code == 201, r.text
