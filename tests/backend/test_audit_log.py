"""Tests for /api/v1/audit-log endpoints."""

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
    # Let the audit middleware use the same in-memory DB
    app.state.audit_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "audit@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Auditor", "password": "testpass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Auth gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/audit-log/")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Listing — empty state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_empty_on_fresh_user(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/audit-log/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["total"] == 0
    assert body["page"] == 1


# ---------------------------------------------------------------------------
# Entries appear after mutations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_records_project_create(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "ac1@example.com")
    await client.post("/api/v1/projects/", json={"name": "Nieuwbouw"}, headers=headers)

    resp = await client.get("/api/v1/audit-log/", headers=headers)
    assert resp.status_code == 200
    entries = resp.json()["data"]
    assert len(entries) >= 1
    entry = next(e for e in entries if e["entity_type"] == "project" and e["action"] == "create")
    assert entry["before_data"] is None
    assert entry["after_data"] is not None
    assert entry["after_data"]["name"] == "Nieuwbouw"


@pytest.mark.asyncio
async def test_audit_log_records_project_update(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "ac2@example.com")
    proj = (
        await client.post("/api/v1/projects/", json={"name": "Oud"}, headers=headers)
    ).json()
    await client.put(
        f"/api/v1/projects/{proj['id']}",
        json={"name": "Nieuw"},
        headers=headers,
    )

    resp = await client.get("/api/v1/audit-log/", headers=headers)
    entries = resp.json()["data"]
    update_entry = next(
        e for e in entries if e["entity_type"] == "project" and e["action"] == "update"
    )
    assert update_entry["before_data"]["name"] == "Oud"
    assert update_entry["after_data"]["name"] == "Nieuw"


@pytest.mark.asyncio
async def test_audit_log_records_project_delete(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "ac3@example.com")
    proj = (
        await client.post("/api/v1/projects/", json={"name": "Te slopen"}, headers=headers)
    ).json()
    await client.delete(f"/api/v1/projects/{proj['id']}", headers=headers)

    resp = await client.get("/api/v1/audit-log/", headers=headers)
    entries = resp.json()["data"]
    del_entry = next(
        e for e in entries if e["entity_type"] == "project" and e["action"] == "delete"
    )
    assert del_entry["entity_id"] == proj["id"]
    assert del_entry["before_data"] is not None
    assert del_entry["after_data"] is None


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_filter_by_action(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "ac4@example.com")
    proj = (
        await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    ).json()
    await client.put(f"/api/v1/projects/{proj['id']}", json={"name": "P2"}, headers=headers)

    resp = await client.get("/api/v1/audit-log/?action=create", headers=headers)
    entries = resp.json()["data"]
    assert all(e["action"] == "create" for e in entries)


@pytest.mark.asyncio
async def test_audit_log_filter_by_entity_type(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "ac5@example.com")
    await client.post("/api/v1/projects/", json={"name": "Huis"}, headers=headers)

    resp = await client.get("/api/v1/audit-log/?entity_type=project", headers=headers)
    entries = resp.json()["data"]
    assert all(e["entity_type"] == "project" for e in entries)


@pytest.mark.asyncio
async def test_audit_log_isolates_users(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "iso1@example.com")
    h2 = await _auth_headers(client, "iso2@example.com")
    await client.post("/api/v1/projects/", json={"name": "Private"}, headers=h1)

    resp = await client.get("/api/v1/audit-log/", headers=h2)
    assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_pagination(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "page@example.com")
    # Create 3 projects → 3 create entries
    for i in range(3):
        await client.post("/api/v1/projects/", json={"name": f"P{i}"}, headers=headers)

    resp = await client.get("/api/v1/audit-log/?page=1&per_page=2", headers=headers)
    body = resp.json()
    assert body["total"] >= 3
    assert len(body["data"]) == 2
    assert body["page"] == 1
    assert body["per_page"] == 2


# ---------------------------------------------------------------------------
# Response shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_log_entry_has_required_fields(client: AsyncClient) -> None:
    headers = await _auth_headers(client, "shape@example.com")
    await client.post("/api/v1/projects/", json={"name": "Shape"}, headers=headers)

    resp = await client.get("/api/v1/audit-log/", headers=headers)
    entry = resp.json()["data"][0]
    for field in ("id", "user_id", "action", "entity_type", "entity_id", "created_at"):
        assert field in entry, f"Missing field: {field}"
