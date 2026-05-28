"""Tests for customer portal — token-based read-only project view."""

from __future__ import annotations

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
    app.state.test_session_factory = session_factory
    # Wire audit middleware to the same in-memory DB to avoid production DB access.
    app.state.audit_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


async def _auth(client: AsyncClient, email: str = "contractor@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Contractor", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _make_project(client: AsyncClient, headers: dict, name: str = "Badkamer Renovatie") -> dict:
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Share token generation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_share_token_requires_auth(client: AsyncClient) -> None:
    import uuid
    project_id = str(uuid.uuid4())
    resp = await client.post(f"/api/v1/projects/{project_id}/share-token")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_generate_share_token_for_own_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _make_project(client, headers)
    project_id = project["id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/share-token", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "token" in data
    assert "expires_at" in data
    assert len(data["token"]) >= 32


@pytest.mark.asyncio
async def test_generate_share_token_other_user_project_forbidden(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "other@example.com")
    project = await _make_project(client, h1)

    resp = await client.post(f"/api/v1/projects/{project['id']}/share-token", headers=h2)
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_generate_share_token_nonexistent_project(client: AsyncClient) -> None:
    import uuid
    headers = await _auth(client)
    resp = await client.post(f"/api/v1/projects/{uuid.uuid4()}/share-token", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Portal overview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_portal_overview_valid_token(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _make_project(client, headers, "Keuken Verbouwing")
    project_id = project["id"]

    tok_resp = await client.post(f"/api/v1/projects/{project_id}/share-token", headers=headers)
    token = tok_resp.json()["token"]

    resp = await client.get(f"/api/v1/portal/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project"]["name"] == "Keuken Verbouwing"
    assert data["project"]["status"] == "draft"
    assert "phases" in data


@pytest.mark.asyncio
async def test_portal_overview_invalid_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/portal/this-token-does-not-exist")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_portal_overview_no_auth_required(client: AsyncClient) -> None:
    """Portal endpoints must work without Authorization header."""
    headers = await _auth(client)
    project = await _make_project(client, headers)
    tok_resp = await client.post(f"/api/v1/projects/{project['id']}/share-token", headers=headers)
    token = tok_resp.json()["token"]

    # No auth header
    resp = await client.get(f"/api/v1/portal/{token}")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Portal timeline
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_portal_timeline(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _make_project(client, headers)
    project_id = project["id"]

    # Add a phase
    await client.post(
        f"/api/v1/projects/{project_id}/phases",
        json={"name": "Voorbereiding", "order_index": 0},
        headers=headers,
    )

    tok_resp = await client.post(f"/api/v1/projects/{project_id}/share-token", headers=headers)
    token = tok_resp.json()["token"]

    resp = await client.get(f"/api/v1/portal/{token}/timeline")
    assert resp.status_code == 200
    data = resp.json()
    assert "phases" in data
    assert len(data["phases"]) == 1
    assert data["phases"][0]["name"] == "Voorbereiding"


@pytest.mark.asyncio
async def test_portal_timeline_invalid_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/portal/bad-token/timeline")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Portal photos
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_portal_photos_empty(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _make_project(client, headers)
    tok_resp = await client.post(f"/api/v1/projects/{project['id']}/share-token", headers=headers)
    token = tok_resp.json()["token"]

    resp = await client.get(f"/api/v1/portal/{token}/photos")
    assert resp.status_code == 200
    data = resp.json()
    assert data["photos"] == []


@pytest.mark.asyncio
async def test_portal_photos_invalid_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/portal/bad-token/photos")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Portal invoices
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_portal_invoices_empty(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _make_project(client, headers)
    tok_resp = await client.post(f"/api/v1/projects/{project['id']}/share-token", headers=headers)
    token = tok_resp.json()["token"]

    resp = await client.get(f"/api/v1/portal/{token}/invoices")
    assert resp.status_code == 200
    data = resp.json()
    assert data["invoices"] == []


@pytest.mark.asyncio
async def test_portal_invoices_invalid_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/portal/bad-token/invoices")
    assert resp.status_code == 404
