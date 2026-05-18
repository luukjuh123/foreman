"""Tests for Staff model + CRUD endpoints with availability windows."""

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


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_staff_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "Jan Bouwer", "role": "carpenter", "hourly_rate_cents": 3500},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["full_name"] == "Jan Bouwer"
    assert body["role"] == "carpenter"
    assert body["hourly_rate_cents"] == 3500
    assert body["active"] is True
    assert body["availability"] == []


@pytest.mark.asyncio
async def test_hourly_rate_must_be_non_negative_integer(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "X", "role": "laborer", "hourly_rate_cents": -1},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_staff_excludes_other_owners(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@example.com")
    h2 = await _auth(client, "b@example.com")
    await client.post(
        "/api/v1/staff/",
        json={"full_name": "Alice", "role": "painter", "hourly_rate_cents": 2500},
        headers=h1,
    )
    await client.post(
        "/api/v1/staff/",
        json={"full_name": "Bob", "role": "painter", "hourly_rate_cents": 2700},
        headers=h2,
    )
    resp = await client.get("/api/v1/staff/", headers=h1)
    assert resp.status_code == 200
    names = [s["full_name"] for s in resp.json()["data"]]
    assert names == ["Alice"]


@pytest.mark.asyncio
async def test_update_staff(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "Klaas", "role": "tiler", "hourly_rate_cents": 3000},
        headers=headers,
    )
    sid = resp.json()["id"]
    resp = await client.put(
        f"/api/v1/staff/{sid}",
        json={"hourly_rate_cents": 3200, "active": False},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["hourly_rate_cents"] == 3200
    assert resp.json()["active"] is False


@pytest.mark.asyncio
async def test_soft_delete_staff(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "Y", "role": "plumber", "hourly_rate_cents": 4000},
        headers=headers,
    )
    sid = resp.json()["id"]
    resp = await client.delete(f"/api/v1/staff/{sid}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get("/api/v1/staff/", headers=headers)
    assert resp.json()["data"] == []
    resp = await client.get(f"/api/v1/staff/{sid}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_availability_window_crud(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "Piet", "role": "carpenter", "hourly_rate_cents": 3500},
        headers=headers,
    )
    sid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/staff/{sid}/availability",
        json={"day_of_week": 0, "start_time": "08:00", "end_time": "16:00"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    win = resp.json()
    assert win["day_of_week"] == 0
    assert win["start_time"].startswith("08:00")
    assert win["end_time"].startswith("16:00")

    resp = await client.post(
        f"/api/v1/staff/{sid}/availability",
        json={"day_of_week": 1, "start_time": "17:00", "end_time": "09:00"},
        headers=headers,
    )
    assert resp.status_code == 422

    resp = await client.post(
        f"/api/v1/staff/{sid}/availability",
        json={"day_of_week": 7, "start_time": "08:00", "end_time": "16:00"},
        headers=headers,
    )
    assert resp.status_code == 422

    resp = await client.get(f"/api/v1/staff/{sid}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["availability"]) == 1


@pytest.mark.asyncio
async def test_cannot_touch_other_users_staff(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "thief@example.com")
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": "Z", "role": "x", "hourly_rate_cents": 100},
        headers=h1,
    )
    sid = resp.json()["id"]
    assert (await client.get(f"/api/v1/staff/{sid}", headers=h2)).status_code == 404
    assert (
        await client.put(f"/api/v1/staff/{sid}", json={"full_name": "X"}, headers=h2)
    ).status_code == 404
    assert (await client.delete(f"/api/v1/staff/{sid}", headers=h2)).status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/staff/")).status_code in (401, 403)
