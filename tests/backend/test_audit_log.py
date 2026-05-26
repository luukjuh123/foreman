"""Tests for audit log service and endpoints."""

import uuid

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
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
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


@pytest_asyncio.fixture
async def db_session(app_with_db):
    """Yield a DB session from the overridden get_db dependency."""
    override = app_with_db.dependency_overrides[get_db]
    async for session in override():
        yield session
        break


async def _auth_headers(client: AsyncClient, email: str = "audit@example.com") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Audit User",
        "password": "testpass123",
    })
    assert resp.status_code in (200, 201), resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Service helper tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_record_audit_creates_entry(db_session):
    """record_audit should persist an AuditLog row."""
    from app.services.audit import record_audit

    actor_id = uuid.uuid4()
    entity_id = uuid.uuid4()

    await record_audit(
        db=db_session,
        actor_id=actor_id,
        actor_email="worker@example.nl",
        entity_type="project",
        entity_id=entity_id,
        action="create",
        changes={"name": "Nieuwbouw A"},
    )

    from sqlalchemy import select
    from app.models.audit_log import AuditLog

    result = await db_session.execute(select(AuditLog))
    rows = result.scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.entity_type == "project"
    assert row.entity_id == entity_id
    assert row.action == "create"
    assert row.actor_id == actor_id
    assert row.actor_email == "worker@example.nl"
    assert row.changes is not None
    assert row.created_at is not None


@pytest.mark.asyncio
async def test_record_audit_update_with_diff(db_session):
    """record_audit stores old/new diff for update actions."""
    from app.services.audit import record_audit
    from sqlalchemy import select
    from app.models.audit_log import AuditLog

    entity_id = uuid.uuid4()
    changes = {"old": {"status": "planned"}, "new": {"status": "active"}}

    await record_audit(
        db=db_session,
        actor_id=uuid.uuid4(),
        actor_email="pm@example.nl",
        entity_type="task",
        entity_id=entity_id,
        action="update",
        changes=changes,
    )

    result = await db_session.execute(select(AuditLog))
    row = result.scalars().first()
    assert row.action == "update"
    import json
    stored = json.loads(row.changes) if isinstance(row.changes, str) else row.changes
    assert stored["old"]["status"] == "planned"
    assert stored["new"]["status"] == "active"


# ---------------------------------------------------------------------------
# GET /api/v1/audit-logs/ — list
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_audit_logs_empty(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_audit_logs_returns_entries(client, db_session):
    headers = await _auth_headers(client)

    from app.services.audit import record_audit

    actor_id = uuid.uuid4()
    for i in range(3):
        await record_audit(
            db=db_session,
            actor_id=actor_id,
            actor_email="builder@example.nl",
            entity_type="project",
            entity_id=uuid.uuid4(),
            action="create",
            changes={"index": i},
        )

    resp = await client.get("/api/v1/audit-logs/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3


@pytest.mark.asyncio
async def test_list_audit_logs_ordered_desc(client, db_session):
    """Most recent entries come first."""
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    entity_ids = [uuid.uuid4() for _ in range(2)]
    for eid in entity_ids:
        await record_audit(
            db=db_session,
            actor_id=uuid.uuid4(),
            actor_email="x@x.nl",
            entity_type="invoice",
            entity_id=eid,
            action="create",
            changes={},
        )

    resp = await client.get("/api/v1/audit-logs/", headers=headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    # created_at should be descending
    ts0 = items[0]["created_at"]
    ts1 = items[1]["created_at"]
    assert ts0 >= ts1


# ---------------------------------------------------------------------------
# GET /api/v1/audit-logs/ — filtering
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_filter_by_entity_type(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    actor_id = uuid.uuid4()
    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="project", entity_id=uuid.uuid4(), action="create", changes={})
    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="invoice", entity_id=uuid.uuid4(), action="create", changes={})

    resp = await client.get("/api/v1/audit-logs/?entity_type=project", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["entity_type"] == "project"


@pytest.mark.asyncio
async def test_filter_by_entity_id(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    target_id = uuid.uuid4()
    other_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="task", entity_id=target_id, action="create", changes={})
    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="task", entity_id=other_id, action="create", changes={})

    resp = await client.get(f"/api/v1/audit-logs/?entity_id={target_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["entity_id"] == str(target_id)


@pytest.mark.asyncio
async def test_filter_by_action(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    actor_id = uuid.uuid4()
    eid = uuid.uuid4()
    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="project", entity_id=eid, action="create", changes={})
    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="project", entity_id=eid, action="update", changes={})
    await record_audit(db=db_session, actor_id=actor_id, actor_email="a@a.nl",
                       entity_type="project", entity_id=eid, action="delete", changes={})

    resp = await client.get("/api/v1/audit-logs/?action=update", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["action"] == "update"


@pytest.mark.asyncio
async def test_filter_by_actor_id(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    actor_a = uuid.uuid4()
    actor_b = uuid.uuid4()

    await record_audit(db=db_session, actor_id=actor_a, actor_email="a@a.nl",
                       entity_type="project", entity_id=uuid.uuid4(), action="create", changes={})
    await record_audit(db=db_session, actor_id=actor_b, actor_email="b@b.nl",
                       entity_type="project", entity_id=uuid.uuid4(), action="create", changes={})

    resp = await client.get(f"/api/v1/audit-logs/?actor_id={actor_a}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["actor_id"] == str(actor_a)


# ---------------------------------------------------------------------------
# GET /api/v1/audit-logs/ — pagination
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pagination_limit(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    actor_id = uuid.uuid4()
    for _ in range(5):
        await record_audit(db=db_session, actor_id=actor_id, actor_email="p@p.nl",
                           entity_type="project", entity_id=uuid.uuid4(), action="create", changes={})

    resp = await client.get("/api/v1/audit-logs/?limit=2", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_pagination_offset(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    actor_id = uuid.uuid4()
    for _ in range(5):
        await record_audit(db=db_session, actor_id=actor_id, actor_email="p@p.nl",
                           entity_type="project", entity_id=uuid.uuid4(), action="create", changes={})

    resp_all = await client.get("/api/v1/audit-logs/", headers=headers)
    resp_offset = await client.get("/api/v1/audit-logs/?offset=2", headers=headers)
    all_ids = [i["id"] for i in resp_all.json()]
    offset_ids = [i["id"] for i in resp_offset.json()]
    # offset=2 should skip first 2 entries
    assert offset_ids == all_ids[2:]


# ---------------------------------------------------------------------------
# GET /api/v1/audit-logs/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_single_audit_log(client, db_session):
    headers = await _auth_headers(client)
    from app.services.audit import record_audit

    entity_id = uuid.uuid4()
    await record_audit(
        db=db_session,
        actor_id=uuid.uuid4(),
        actor_email="single@example.nl",
        entity_type="customer",
        entity_id=entity_id,
        action="delete",
        changes={"name": "Verwijderd Bedrijf"},
    )

    list_resp = await client.get("/api/v1/audit-logs/", headers=headers)
    assert list_resp.status_code == 200
    entry_id = list_resp.json()[0]["id"]

    resp = await client.get(f"/api/v1/audit-logs/{entry_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == entry_id
    assert data["entity_type"] == "customer"
    assert data["action"] == "delete"
    assert data["actor_email"] == "single@example.nl"


@pytest.mark.asyncio
async def test_get_audit_log_not_found(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-logs/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_audit_log_requires_auth(client):
    resp = await client.get("/api/v1/audit-logs/")
    assert resp.status_code == 401
