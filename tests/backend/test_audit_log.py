"""Tests for audit log — track user actions with timestamp, actor, and diff."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.audit_log import AuditLog
from app.services.audit import log_action

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
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    app, _ = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client, email="audit@example.com"):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test User", "password": "testpass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Service helper: log_action
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_action_creates_entry(app_with_db) -> None:
    _, session_factory = app_with_db
    user_id = uuid.uuid4()
    entity_id = uuid.uuid4()

    async with session_factory() as db:
        entry = await log_action(
            db=db,
            user_id=user_id,
            action="create",
            entity_type="project",
            entity_id=entity_id,
            diff={"name": "New Project", "status": "active"},
        )
        await db.commit()
        await db.refresh(entry)

    assert entry.id is not None
    assert entry.user_id == user_id
    assert entry.action == "create"
    assert entry.entity_type == "project"
    assert entry.entity_id == entity_id
    assert entry.diff == {"name": "New Project", "status": "active"}
    assert entry.ip_address is None
    assert entry.created_at is not None


@pytest.mark.asyncio
async def test_log_action_with_ip_address(app_with_db) -> None:
    _, session_factory = app_with_db
    user_id = uuid.uuid4()
    entity_id = uuid.uuid4()

    async with session_factory() as db:
        entry = await log_action(
            db=db,
            user_id=user_id,
            action="delete",
            entity_type="task",
            entity_id=entity_id,
            diff={"id": str(entity_id)},
            ip_address="192.168.1.1",
        )
        await db.commit()
        await db.refresh(entry)

    assert entry.ip_address == "192.168.1.1"
    assert entry.action == "delete"


@pytest.mark.asyncio
async def test_log_action_allows_null_user_id(app_with_db) -> None:
    """System actions can omit user_id."""
    _, session_factory = app_with_db
    entity_id = uuid.uuid4()

    async with session_factory() as db:
        entry = await log_action(
            db=db,
            user_id=None,
            action="update",
            entity_type="invoice",
            entity_id=entity_id,
            diff={"status": {"old": "draft", "new": "sent"}},
        )
        await db.commit()
        await db.refresh(entry)

    assert entry.user_id is None
    assert entry.action == "update"


@pytest.mark.asyncio
async def test_log_action_persists_to_db(app_with_db) -> None:
    _, session_factory = app_with_db
    user_id = uuid.uuid4()
    entity_id = uuid.uuid4()

    async with session_factory() as db:
        await log_action(
            db=db,
            user_id=user_id,
            action="create",
            entity_type="project",
            entity_id=entity_id,
            diff={"name": "Test"},
        )
        await db.commit()

    async with session_factory() as db:
        rows = (await db.execute(select(AuditLog))).scalars().all()
        assert len(rows) == 1
        assert rows[0].entity_type == "project"


# ---------------------------------------------------------------------------
# GET /api/v1/audit-logs — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_audit_logs_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/audit-logs/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_audit_logs_empty(app_with_db, client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_audit_logs_returns_entries(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    user_id = uuid.uuid4()
    entity_id = uuid.uuid4()

    async with session_factory() as db:
        for i in range(3):
            await log_action(
                db=db,
                user_id=user_id,
                action="create",
                entity_type="project",
                entity_id=entity_id,
                diff={"i": i},
            )
        await db.commit()

    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 3
    assert body["total"] == 3


@pytest.mark.asyncio
async def test_list_audit_logs_filter_entity_type(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    eid = uuid.uuid4()

    async with session_factory() as db:
        await log_action(db=db, user_id=None, action="create", entity_type="project", entity_id=eid, diff={})
        await log_action(db=db, user_id=None, action="create", entity_type="invoice", entity_id=eid, diff={})
        await db.commit()

    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/?entity_type=project", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["entity_type"] == "project"


@pytest.mark.asyncio
async def test_list_audit_logs_filter_action(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    eid = uuid.uuid4()

    async with session_factory() as db:
        await log_action(db=db, user_id=None, action="create", entity_type="task", entity_id=eid, diff={})
        await log_action(db=db, user_id=None, action="delete", entity_type="task", entity_id=eid, diff={})
        await db.commit()

    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/?action=delete", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["action"] == "delete"


@pytest.mark.asyncio
async def test_list_audit_logs_filter_entity_id(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    eid_a = uuid.uuid4()
    eid_b = uuid.uuid4()

    async with session_factory() as db:
        await log_action(db=db, user_id=None, action="create", entity_type="task", entity_id=eid_a, diff={})
        await log_action(db=db, user_id=None, action="create", entity_type="task", entity_id=eid_b, diff={})
        await db.commit()

    headers = await _auth_headers(client)
    resp = await client.get(f"/api/v1/audit-logs/?entity_id={eid_a}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["entity_id"] == str(eid_a)


@pytest.mark.asyncio
async def test_list_audit_logs_filter_user_id(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    uid_a = uuid.uuid4()
    uid_b = uuid.uuid4()
    eid = uuid.uuid4()

    async with session_factory() as db:
        await log_action(db=db, user_id=uid_a, action="create", entity_type="project", entity_id=eid, diff={})
        await log_action(db=db, user_id=uid_b, action="create", entity_type="project", entity_id=eid, diff={})
        await db.commit()

    headers = await _auth_headers(client)
    resp = await client.get(f"/api/v1/audit-logs/?user_id={uid_a}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["user_id"] == str(uid_a)


@pytest.mark.asyncio
async def test_list_audit_logs_pagination(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    eid = uuid.uuid4()

    async with session_factory() as db:
        for _ in range(5):
            await log_action(db=db, user_id=None, action="create", entity_type="project", entity_id=eid, diff={})
        await db.commit()

    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/?skip=0&limit=2", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 2
    assert body["total"] == 5

    resp2 = await client.get("/api/v1/audit-logs/?skip=2&limit=2", headers=headers)
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert len(body2["data"]) == 2

    resp3 = await client.get("/api/v1/audit-logs/?skip=4&limit=2", headers=headers)
    assert resp3.status_code == 200
    body3 = resp3.json()
    assert len(body3["data"]) == 1


# ---------------------------------------------------------------------------
# GET /api/v1/audit-logs/{log_id} — single entry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_audit_log_requires_auth(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    eid = uuid.uuid4()

    async with session_factory() as db:
        entry = await log_action(
            db=db, user_id=None, action="create", entity_type="project", entity_id=eid, diff={}
        )
        await db.commit()
        await db.refresh(entry)

    resp = await client.get(f"/api/v1/audit-logs/{entry.id}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_audit_log_by_id(app_with_db, client: AsyncClient) -> None:
    _, session_factory = app_with_db
    eid = uuid.uuid4()

    async with session_factory() as db:
        entry = await log_action(
            db=db,
            user_id=None,
            action="update",
            entity_type="project",
            entity_id=eid,
            diff={"status": {"old": "active", "new": "completed"}},
        )
        await db.commit()
        await db.refresh(entry)
        log_id = entry.id

    headers = await _auth_headers(client)
    resp = await client.get(f"/api/v1/audit-logs/{log_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(log_id)
    assert body["action"] == "update"
    assert body["entity_type"] == "project"
    assert body["diff"] == {"status": {"old": "active", "new": "completed"}}


@pytest.mark.asyncio
async def test_get_audit_log_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get(f"/api/v1/audit-logs/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404
