"""Tests for AuditLog model, service, and read-only API endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.audit import record_audit

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


async def _auth(client: AsyncClient, email: str = "auditor@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Auditor", "password": "supersecret"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# --- Service tests ---

@pytest.mark.asyncio
async def test_record_audit_creates_entry(app_with_db):
    """record_audit inserts a row with the expected fields."""
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    resource_id = uuid.uuid4()
    user_id = uuid.uuid4()

    async with session_factory() as session:
        entry = await record_audit(
            db=session,
            user_id=user_id,
            action="create",
            resource_type="project",
            resource_id=resource_id,
            diff={"name": "New Project"},
            ip_address="127.0.0.1",
        )
        assert entry.id is not None
        assert entry.user_id == user_id
        assert entry.action == "create"
        assert entry.resource_type == "project"
        assert entry.resource_id == resource_id
        assert entry.diff == {"name": "New Project"}
        assert entry.ip_address == "127.0.0.1"
        assert entry.timestamp is not None

    await engine.dispose()


@pytest.mark.asyncio
async def test_record_audit_no_user_id(app_with_db):
    """record_audit works with nullable user_id (system actions)."""
    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        entry = await record_audit(
            db=session,
            user_id=None,
            action="delete",
            resource_type="invoice",
            resource_id=uuid.uuid4(),
        )
        assert entry.user_id is None
        assert entry.action == "delete"

    await engine.dispose()


# --- API tests ---

@pytest.mark.asyncio
async def test_list_audit_logs_empty(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.get("/api/v1/audit", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/audit")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_audit_logs_response_shape(client: AsyncClient) -> None:
    headers = await _auth(client, "list_test@example.com")
    resp = await client.get("/api/v1/audit", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "total" in body
    assert "page" in body
    assert "per_page" in body


@pytest.mark.asyncio
async def test_get_audit_entry_not_found(client: AsyncClient) -> None:
    headers = await _auth(client, "notfound@example.com")
    missing_id = uuid.uuid4()
    resp = await client.get(f"/api/v1/audit/{missing_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_pagination_params(client: AsyncClient) -> None:
    headers = await _auth(client, "pager@example.com")
    resp = await client.get("/api/v1/audit?page=1&per_page=5", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["per_page"] == 5


@pytest.mark.asyncio
async def test_filter_by_resource_type(client: AsyncClient) -> None:
    headers = await _auth(client, "filter_rt@example.com")
    resp = await client.get("/api/v1/audit?resource_type=project", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    for entry in body["data"]:
        assert entry["resource_type"] == "project"


@pytest.mark.asyncio
async def test_filter_by_action(client: AsyncClient) -> None:
    headers = await _auth(client, "filter_ac@example.com")
    resp = await client.get("/api/v1/audit?action=create", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    for entry in body["data"]:
        assert entry["action"] == "create"


@pytest.mark.asyncio
async def test_filter_by_user_id(client: AsyncClient) -> None:
    headers = await _auth(client, "filter_uid@example.com")
    some_uid = uuid.uuid4()
    resp = await client.get(f"/api/v1/audit?user_id={some_uid}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    for entry in body["data"]:
        assert entry["user_id"] == str(some_uid)


@pytest.mark.asyncio
async def test_seeded_entry_retrievable_via_api(app_with_db) -> None:
    """Seed an entry via service and retrieve via API using the same db engine."""
    session_factory = None
    # Access the shared engine from the fixture via the override
    # We test the full round-trip: seed → list → get
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        headers = await _auth(ac, "roundtrip@example.com")

        # Use the overridden db to seed an entry
        db_gen = app_with_db.dependency_overrides[get_db]()
        db = await db_gen.__anext__()
        resource_id = uuid.uuid4()
        entry = await record_audit(
            db=db,
            user_id=None,
            action="update",
            resource_type="task",
            resource_id=resource_id,
            diff={"old": {"status": "todo"}, "new": {"status": "done"}},
        )
        entry_id = entry.id

        # List — should appear
        resp = await ac.get("/api/v1/audit", headers=headers)
        assert resp.status_code == 200
        ids_in_list = [e["id"] for e in resp.json()["data"]]
        assert str(entry_id) in ids_in_list

        # Get single
        resp = await ac.get(f"/api/v1/audit/{entry_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(entry_id)
        assert body["action"] == "update"
        assert body["resource_type"] == "task"
        assert body["diff"] == {"old": {"status": "todo"}, "new": {"status": "done"}}
