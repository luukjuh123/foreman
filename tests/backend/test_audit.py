"""Tests for AuditLog model, service, and router."""

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


async def _auth(client: AsyncClient, email: str = "admin@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Admin", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _get_user_id(client: AsyncClient, headers: dict) -> uuid.UUID:
    resp = await client.get("/api/v1/auth/me", headers=headers)
    return uuid.UUID(resp.json()["id"])


# ---------------------------------------------------------------------------
# Service tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_action_creates_entry(app_with_db) -> None:
    """Service: log_action writes an AuditLog row."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    actor_id = uuid.uuid4()
    resource_id = uuid.uuid4()

    async with session_factory() as db:
        await log_action(
            db=db,
            actor_id=actor_id,
            action="create",
            resource_type="project",
            resource_id=resource_id,
            diff={"name": "Test Project"},
        )

    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    async with session_factory() as db:
        result = await db.execute(select(AuditLog))
        entries = result.scalars().all()

    assert len(entries) == 1
    entry = entries[0]
    assert entry.actor_id == actor_id
    assert entry.action == "create"
    assert entry.resource_type == "project"
    assert entry.resource_id == resource_id
    assert entry.diff == {"name": "Test Project"}
    assert entry.ip_address is None
    await engine.dispose()


@pytest.mark.asyncio
async def test_log_action_with_ip_address(app_with_db) -> None:
    """Service: log_action stores ip_address when provided."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        await log_action(
            db=db,
            actor_id=None,
            action="delete",
            resource_type="invoice",
            resource_id=uuid.uuid4(),
            diff={"id": "abc"},
            ip_address="192.168.1.1",
        )

    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    async with session_factory() as db:
        result = await db.execute(select(AuditLog))
        entry = result.scalar_one()

    assert entry.actor_id is None
    assert entry.action == "delete"
    assert entry.ip_address == "192.168.1.1"
    await engine.dispose()


# ---------------------------------------------------------------------------
# Router tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_audit_requires_auth(client: AsyncClient) -> None:
    """GET /api/v1/audit/ returns 401 without auth."""
    resp = await client.get("/api/v1/audit/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_audit_empty(client: AsyncClient) -> None:
    """Authenticated user gets empty list when no entries exist."""
    headers = await _auth(client)
    resp = await client.get("/api/v1/audit/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0
    assert body["page"] == 1
    assert body["per_page"] == 20


@pytest.mark.asyncio
async def test_list_audit_returns_entries(app_with_db) -> None:
    """Entries created via service appear in the list endpoint."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        # Register and get auth token
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "audit@example.com", "name": "Auditor", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Seed two audit entries
        async with session_factory() as db:
            await log_action(
                db=db,
                actor_id=uuid.uuid4(),
                action="create",
                resource_type="project",
                resource_id=uuid.uuid4(),
                diff={"name": "Proj A"},
            )
            await log_action(
                db=db,
                actor_id=uuid.uuid4(),
                action="update",
                resource_type="invoice",
                resource_id=uuid.uuid4(),
                diff={"status": {"old": "draft", "new": "sent"}},
            )

        resp = await ac.get("/api/v1/audit/", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert len(body["data"]) == 2

    await engine.dispose()


async def _db_override(session_factory):
    async with session_factory() as session:
        yield session


@pytest.mark.asyncio
async def test_filter_by_resource_type(app_with_db) -> None:
    """?resource_type= filter works."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "filter1@example.com", "name": "F1", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        async with session_factory() as db:
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="create",
                resource_type="project", resource_id=uuid.uuid4(), diff={},
            )
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="create",
                resource_type="invoice", resource_id=uuid.uuid4(), diff={},
            )
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="delete",
                resource_type="project", resource_id=uuid.uuid4(), diff={},
            )

        resp = await ac.get("/api/v1/audit/?resource_type=project", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert all(e["resource_type"] == "project" for e in body["data"])

    await engine.dispose()


@pytest.mark.asyncio
async def test_filter_by_action(app_with_db) -> None:
    """?action= filter works."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "filter2@example.com", "name": "F2", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        async with session_factory() as db:
            for action in ("create", "create", "update", "delete"):
                await log_action(
                    db=db, actor_id=uuid.uuid4(), action=action,
                    resource_type="task", resource_id=uuid.uuid4(), diff={},
                )

        resp = await ac.get("/api/v1/audit/?action=create", headers=headers)
        body = resp.json()
        assert body["total"] == 2
        assert all(e["action"] == "create" for e in body["data"])

    await engine.dispose()


@pytest.mark.asyncio
async def test_filter_by_actor_id(app_with_db) -> None:
    """?actor_id= filter works."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "filter3@example.com", "name": "F3", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        actor_a = uuid.uuid4()
        actor_b = uuid.uuid4()
        async with session_factory() as db:
            await log_action(
                db=db, actor_id=actor_a, action="create",
                resource_type="project", resource_id=uuid.uuid4(), diff={},
            )
            await log_action(
                db=db, actor_id=actor_b, action="update",
                resource_type="project", resource_id=uuid.uuid4(), diff={},
            )
            await log_action(
                db=db, actor_id=actor_a, action="delete",
                resource_type="invoice", resource_id=uuid.uuid4(), diff={},
            )

        resp = await ac.get(f"/api/v1/audit/?actor_id={actor_a}", headers=headers)
        body = resp.json()
        assert body["total"] == 2
        assert all(e["actor_id"] == str(actor_a) for e in body["data"])

    await engine.dispose()


@pytest.mark.asyncio
async def test_filter_by_resource_id(app_with_db) -> None:
    """?resource_id= filter works."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "filter4@example.com", "name": "F4", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        target_id = uuid.uuid4()
        async with session_factory() as db:
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="create",
                resource_type="project", resource_id=target_id, diff={},
            )
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="update",
                resource_type="project", resource_id=target_id, diff={},
            )
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="create",
                resource_type="project", resource_id=uuid.uuid4(), diff={},
            )

        resp = await ac.get(f"/api/v1/audit/?resource_id={target_id}", headers=headers)
        body = resp.json()
        assert body["total"] == 2

    await engine.dispose()


@pytest.mark.asyncio
async def test_pagination(app_with_db) -> None:
    """Pagination via page and per_page works."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "page@example.com", "name": "Pager", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        async with session_factory() as db:
            for i in range(5):
                await log_action(
                    db=db, actor_id=uuid.uuid4(), action="create",
                    resource_type="task", resource_id=uuid.uuid4(), diff={"index": i},
                )

        resp = await ac.get("/api/v1/audit/?page=1&per_page=2", headers=headers)
        body = resp.json()
        assert body["total"] == 5
        assert len(body["data"]) == 2
        assert body["page"] == 1
        assert body["per_page"] == 2

        resp2 = await ac.get("/api/v1/audit/?page=3&per_page=2", headers=headers)
        body2 = resp2.json()
        assert body2["total"] == 5
        assert len(body2["data"]) == 1

    await engine.dispose()


@pytest.mark.asyncio
async def test_results_ordered_newest_first(app_with_db) -> None:
    """Results come back newest-first."""
    from app.services.audit import log_action

    engine = create_async_engine(
        TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app_with_db.dependency_overrides[get_db] = lambda: _db_override(session_factory)

    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={"email": "order@example.com", "name": "Order", "password": "secret123"},
        )
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        async with session_factory() as db:
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="create",
                resource_type="project", resource_id=uuid.uuid4(), diff={"seq": 1},
            )
            await log_action(
                db=db, actor_id=uuid.uuid4(), action="update",
                resource_type="project", resource_id=uuid.uuid4(), diff={"seq": 2},
            )

        resp = await ac.get("/api/v1/audit/", headers=headers)
        body = resp.json()
        assert body["total"] == 2
        # Newest (seq=2 update) comes first
        first_created_at = body["data"][0]["created_at"]
        second_created_at = body["data"][1]["created_at"]
        assert first_created_at >= second_created_at

    await engine.dispose()
