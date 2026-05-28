"""Tests for punch item (nakijklijst) endpoints."""

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
    app.state.test_session_factory = session_factory
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


async def _register_and_token(client: AsyncClient, email: str = "user@example.com") -> str:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    return resp.json()["access_token"]


async def _auth_headers(client: AsyncClient, email: str = "user@example.com") -> dict:
    token = await _register_and_token(client, email)
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/v1/projects/", json={
        "name": "Test Project",
        "status": "active",
    }, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_task_in_project(client: AsyncClient, headers: dict, project_id: str) -> str:
    """Create a phase + task and return task_id."""
    phase_resp = await client.post(f"/api/v1/projects/{project_id}/phases", json={
        "name": "Phase 1",
        "status": "active",
    }, headers=headers)
    assert phase_resp.status_code == 201
    phase_id = phase_resp.json()["id"]

    task_resp = await client.post(f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks", json={
        "name": "Task 1",
        "status": "in_progress",
    }, headers=headers)
    assert task_resp.status_code == 201
    return task_resp.json()["id"]


# ---------------------------------------------------------------------------
# Create punch item
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_punch_item(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Voeg afdichting toe aan nok",
    }, headers=headers)

    assert resp.status_code == 201
    data = resp.json()
    assert data["description"] == "Voeg afdichting toe aan nok"
    assert data["status"] == "open"
    assert data["project_id"] == project_id
    assert data["task_id"] == task_id
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_punch_item_with_photos(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Lek in dakbedekking",
        "photo_before_url": "https://cdn.example.com/before.jpg",
    }, headers=headers)

    assert resp.status_code == 201
    data = resp.json()
    assert data["photo_before_url"] == "https://cdn.example.com/before.jpg"


@pytest.mark.asyncio
async def test_create_punch_item_wrong_project_returns_404(client: AsyncClient) -> None:
    import uuid
    headers = await _auth_headers(client)
    fake_project_id = str(uuid.uuid4())

    resp = await client.post(f"/api/v1/projects/{fake_project_id}/punch-items", json={
        "task_id": str(uuid.uuid4()),
        "description": "Test",
    }, headers=headers)

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_punch_item_other_user_forbidden(client: AsyncClient) -> None:
    headers_a = await _auth_headers(client, "a@example.com")
    headers_b = await _auth_headers(client, "b@example.com")
    project_id = await _create_project(client, headers_a)
    task_id = await _create_task_in_project(client, headers_a, project_id)

    resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Toegang geweigerd test",
    }, headers=headers_b)

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# List punch items
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_punch_items_empty(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/punch-items", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["data"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_punch_items_filter_by_status(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    # Create two open and one fixed item
    for i in range(2):
        await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
            "task_id": task_id,
            "description": f"Open punt {i}",
        }, headers=headers)

    create_resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Fixed punt",
        "status": "fixed",
    }, headers=headers)
    assert create_resp.status_code == 201

    # Filter by open
    resp = await client.get(
        f"/api/v1/projects/{project_id}/punch-items?status=open", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert all(item["status"] == "open" for item in data["data"])


# ---------------------------------------------------------------------------
# Patch punch item
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patch_punch_item_status(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    create_resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Schroeven ontbreken",
    }, headers=headers)
    item_id = create_resp.json()["id"]

    patch_resp = await client.patch(f"/api/v1/projects/{project_id}/punch-items/{item_id}", json={
        "status": "fixed",
        "photo_after_url": "https://cdn.example.com/after.jpg",
    }, headers=headers)

    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["status"] == "fixed"
    assert data["photo_after_url"] == "https://cdn.example.com/after.jpg"
    assert data["resolved_at"] is not None


@pytest.mark.asyncio
async def test_patch_punch_item_verified_sets_resolved_at(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    create_resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Verificatie test",
    }, headers=headers)
    item_id = create_resp.json()["id"]

    patch_resp = await client.patch(f"/api/v1/projects/{project_id}/punch-items/{item_id}", json={
        "status": "verified",
    }, headers=headers)

    assert patch_resp.status_code == 200
    assert patch_resp.json()["resolved_at"] is not None


# ---------------------------------------------------------------------------
# Delete punch item
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_punch_item(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    create_resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Te verwijderen punt",
    }, headers=headers)
    item_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/projects/{project_id}/punch-items/{item_id}", headers=headers)
    assert del_resp.status_code == 204

    list_resp = await client.get(f"/api/v1/projects/{project_id}/punch-items", headers=headers)
    assert list_resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Bulk status update
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_status_update(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    ids = []
    for i in range(3):
        resp = await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
            "task_id": task_id,
            "description": f"Punt {i}",
        }, headers=headers)
        ids.append(resp.json()["id"])

    bulk_resp = await client.patch(f"/api/v1/projects/{project_id}/punch-items/bulk-status", json={
        "ids": ids[:2],
        "status": "fixed",
    }, headers=headers)

    assert bulk_resp.status_code == 200
    data = bulk_resp.json()
    assert data["updated"] == 2

    list_resp = await client.get(
        f"/api/v1/projects/{project_id}/punch-items?status=fixed", headers=headers
    )
    assert list_resp.json()["total"] == 2


# ---------------------------------------------------------------------------
# Summary endpoint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_punch_items_summary(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    task_id = await _create_task_in_project(client, headers, project_id)

    # 2 open, 1 fixed
    for i in range(2):
        await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
            "task_id": task_id,
            "description": f"Open {i}",
        }, headers=headers)
    await client.post(f"/api/v1/projects/{project_id}/punch-items", json={
        "task_id": task_id,
        "description": "Fixed",
        "status": "fixed",
    }, headers=headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/punch-items/summary", headers=headers)

    assert resp.status_code == 200
    summary = resp.json()
    assert len(summary) == 1  # one task with punch items
    entry = summary[0]
    assert entry["task_id"] == task_id
    assert entry["open"] == 2
    assert entry["fixed"] == 1
    assert entry["verified"] == 0
    assert entry["total"] == 3
