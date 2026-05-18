"""Tests for staff assignments — schedule staff to projects/tasks without overlap."""

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


async def _auth(client, email="boss@example.com"):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_staff(client, headers, name="Jan"):
    resp = await client.post(
        "/api/v1/staff/",
        json={"full_name": name, "role": "carpenter", "hourly_rate_cents": 4000},
        headers=headers,
    )
    return resp.json()["id"]


async def _make_project(client, headers, name="Kitchen"):
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_create_assignment(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    pid = await _make_project(client, h)
    resp = await client.post(
        "/api/v1/assignments/",
        json={
            "staff_id": sid, "project_id": pid,
            "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T17:00:00Z",
        }, headers=h,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["staff_id"] == sid
    assert body["task_id"] is None


@pytest.mark.asyncio
async def test_inverted_window_rejected(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    pid = await _make_project(client, h)
    resp = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T17:00:00Z", "end_at": "2026-06-01T08:00:00Z",
    }, headers=h)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_overlap_same_staff_rejected(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    pid = await _make_project(client, h)
    r1 = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T10:00:00Z", "end_at": "2026-06-01T14:00:00Z",
    }, headers=h)
    assert r2.status_code == 422
    assert "overlap" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_back_to_back_allowed(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    pid = await _make_project(client, h)
    r1 = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    r2 = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T12:00:00Z", "end_at": "2026-06-01T16:00:00Z",
    }, headers=h)
    assert r1.status_code == 201
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_different_staff_overlap_allowed(client):
    h = await _auth(client)
    a = await _make_staff(client, h, name="Jan")
    b = await _make_staff(client, h, name="Piet")
    pid = await _make_project(client, h)
    common = {"project_id": pid, "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z"}
    r1 = await client.post("/api/v1/assignments/", json={**common, "staff_id": a}, headers=h)
    r2 = await client.post("/api/v1/assignments/", json={**common, "staff_id": b}, headers=h)
    assert r1.status_code == 201
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_list_filtered_by_staff(client):
    h = await _auth(client)
    a = await _make_staff(client, h, name="Jan")
    b = await _make_staff(client, h, name="Piet")
    pid = await _make_project(client, h)
    await client.post("/api/v1/assignments/", json={
        "staff_id": a, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    await client.post("/api/v1/assignments/", json={
        "staff_id": b, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    resp = await client.get(f"/api/v1/assignments/?staff_id={a}", headers=h)
    rows = resp.json()
    assert len(rows) == 1 and rows[0]["staff_id"] == a


@pytest.mark.asyncio
async def test_list_filtered_by_project(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    p1 = await _make_project(client, h, name="Kitchen")
    p2 = await _make_project(client, h, name="Bathroom")
    await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": p1,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": p2,
        "start_at": "2026-06-02T08:00:00Z", "end_at": "2026-06-02T12:00:00Z",
    }, headers=h)
    resp = await client.get(f"/api/v1/assignments/?project_id={p2}", headers=h)
    rows = resp.json()
    assert len(rows) == 1 and rows[0]["project_id"] == p2


@pytest.mark.asyncio
async def test_get_one(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    pid = await _make_project(client, h)
    r = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    aid = r.json()["id"]
    g = await client.get(f"/api/v1/assignments/{aid}", headers=h)
    assert g.status_code == 200
    assert g.json()["id"] == aid


@pytest.mark.asyncio
async def test_delete(client):
    h = await _auth(client)
    sid = await _make_staff(client, h)
    pid = await _make_project(client, h)
    r = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h)
    aid = r.json()["id"]
    d = await client.delete(f"/api/v1/assignments/{aid}", headers=h)
    assert d.status_code == 204
    g = await client.get(f"/api/v1/assignments/{aid}", headers=h)
    assert g.status_code == 404


@pytest.mark.asyncio
async def test_owner_isolation(client):
    h1 = await _auth(client, email="boss1@example.com")
    h2 = await _auth(client, email="boss2@example.com")
    sid = await _make_staff(client, h1)
    pid = await _make_project(client, h1)
    resp = await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h2)
    assert resp.status_code == 404
    await client.post("/api/v1/assignments/", json={
        "staff_id": sid, "project_id": pid,
        "start_at": "2026-06-01T08:00:00Z", "end_at": "2026-06-01T12:00:00Z",
    }, headers=h1)
    list2 = await client.get("/api/v1/assignments/", headers=h2)
    assert list2.status_code == 200 and list2.json() == []


@pytest.mark.asyncio
async def test_requires_auth(client):
    resp = await client.get("/api/v1/assignments/")
    assert resp.status_code in (401, 403)
