"""Tests for project/phase/task CRUD endpoints and cycle detection."""

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


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_project(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.post("/api/v1/projects/", json={"name": "My Project"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Project"
    assert "id" in data
    assert "owner_id" in data


@pytest.mark.asyncio
async def test_create_project_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/projects/", json={"name": "No Auth"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_projects_empty(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/projects/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["data"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["per_page"] == 20


@pytest.mark.asyncio
async def test_list_projects_returns_own_only(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "user1@example.com")
    h2 = await _auth_headers(client, "user2@example.com")
    await client.post("/api/v1/projects/", json={"name": "User1 Project"}, headers=h1)
    await client.post("/api/v1/projects/", json={"name": "User2 Project"}, headers=h2)

    resp1 = await client.get("/api/v1/projects/", headers=h1)
    assert resp1.json()["total"] == 1
    assert resp1.json()["data"][0]["name"] == "User1 Project"


@pytest.mark.asyncio
async def test_list_projects_pagination(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    for i in range(5):
        await client.post("/api/v1/projects/", json={"name": f"Project {i}"}, headers=headers)

    resp = await client.get("/api/v1/projects/?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["data"]) == 2
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["per_page"] == 2

    resp2 = await client.get("/api/v1/projects/?page=2&per_page=2", headers=headers)
    assert len(resp2.json()["data"]) == 2

    resp3 = await client.get("/api/v1/projects/?page=3&per_page=2", headers=headers)
    assert len(resp3.json()["data"]) == 1


@pytest.mark.asyncio
async def test_get_project(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/projects/", json={"name": "Get Me"}, headers=headers)
    project_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == project_id
    assert data["name"] == "Get Me"
    assert "phases" in data


@pytest.mark.asyncio
async def test_get_project_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    import uuid
    resp = await client.get(f"/api/v1/projects/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_project(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/projects/", json={"name": "Old Name"}, headers=headers)
    project_id = create_resp.json()["id"]

    resp = await client.put(f"/api/v1/projects/{project_id}", json={"name": "New Name"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_update_project_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "owner@example.com")
    h2 = await _auth_headers(client, "other@example.com")
    create_resp = await client.post("/api/v1/projects/", json={"name": "Owned"}, headers=h1)
    project_id = create_resp.json()["id"]

    resp = await client.put(f"/api/v1/projects/{project_id}", json={"name": "Hack"}, headers=h2)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_project_soft(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/projects/", json={"name": "To Delete"}, headers=headers)
    project_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert resp.status_code == 204

    # Soft deleted — should return 404
    get_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert get_resp.status_code == 404

    # Should not appear in list
    list_resp = await client.get("/api/v1/projects/", headers=headers)
    assert list_resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Phase CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_phase(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    resp = await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Phase 1"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Phase 1"
    assert data["project_id"] == proj["id"]


@pytest.mark.asyncio
async def test_create_phase_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "phaseowner@example.com")
    h2 = await _auth_headers(client, "phaseother@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()
    resp = await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Hack Phase"},
        headers=h2,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_phase(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Phase A"},
        headers=headers,
    )).json()

    resp = await client.put(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}",
        json={"name": "Phase B"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Phase B"


@pytest.mark.asyncio
async def test_delete_phase(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Phase X"},
        headers=headers,
    )).json()

    resp = await client.delete(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}",
        headers=headers,
    )
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Task CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_task(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Ph"},
        headers=headers,
    )).json()

    resp = await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "Task 1"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Task 1"
    assert data["phase_id"] == phase["id"]


@pytest.mark.asyncio
async def test_create_task_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "taskowner@example.com")
    h2 = await _auth_headers(client, "taskother@example.com")
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=h1)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Ph"},
        headers=h1,
    )).json()

    resp = await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "Hack"},
        headers=h2,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_task(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Ph"},
        headers=headers,
    )).json()
    task = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "Old Task"},
        headers=headers,
    )).json()

    resp = await client.put(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks/{task['id']}",
        json={"name": "New Task", "status": "in_progress"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Task"
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_delete_task(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Ph"},
        headers=headers,
    )).json()
    task = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "Task Del"},
        headers=headers,
    )).json()

    resp = await client.delete(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks/{task['id']}",
        headers=headers,
    )
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Task Dependencies + Cycle Detection
# ---------------------------------------------------------------------------

async def _setup_project_with_tasks(client: AsyncClient, headers: dict) -> tuple[str, str, str, str]:
    """Returns (project_id, phase_id, task_a_id, task_b_id)."""
    proj = (await client.post("/api/v1/projects/", json={"name": "Dep Project"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Phase"},
        headers=headers,
    )).json()
    task_a = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "Task A"},
        headers=headers,
    )).json()
    task_b = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "Task B"},
        headers=headers,
    )).json()
    return proj["id"], phase["id"], task_a["id"], task_b["id"]


@pytest.mark.asyncio
async def test_add_valid_dependency(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj_id, _, task_a, task_b = await _setup_project_with_tasks(client, headers)

    # B depends on A (A must complete before B)
    resp = await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_b}/dependencies",
        json={"depends_on_task_id": task_a},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["task_id"] == task_b
    assert data["depends_on_task_id"] == task_a


@pytest.mark.asyncio
async def test_remove_dependency(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj_id, _, task_a, task_b = await _setup_project_with_tasks(client, headers)

    dep = (await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_b}/dependencies",
        json={"depends_on_task_id": task_a},
        headers=headers,
    )).json()

    resp = await client.delete(
        f"/api/v1/projects/{proj_id}/tasks/{task_b}/dependencies/{dep['id']}",
        headers=headers,
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_direct_cycle_rejected(client: AsyncClient) -> None:
    """A -> B, then B -> A should be rejected."""
    headers = await _auth_headers(client)
    proj_id, _, task_a, task_b = await _setup_project_with_tasks(client, headers)

    # A depends on B
    await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_a}/dependencies",
        json={"depends_on_task_id": task_b},
        headers=headers,
    )

    # B depends on A — creates cycle A -> B -> A
    resp = await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_b}/dependencies",
        json={"depends_on_task_id": task_a},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_transitive_cycle_rejected(client: AsyncClient) -> None:
    """A -> B -> C -> A should be rejected."""
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "Cycle"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Ph"},
        headers=headers,
    )).json()

    task_a = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "A"},
        headers=headers,
    )).json()
    task_b = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "B"},
        headers=headers,
    )).json()
    task_c = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "C"},
        headers=headers,
    )).json()

    proj_id = proj["id"]
    # B depends on A
    await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_b['id']}/dependencies",
        json={"depends_on_task_id": task_a["id"]},
        headers=headers,
    )
    # C depends on B
    await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_c['id']}/dependencies",
        json={"depends_on_task_id": task_b["id"]},
        headers=headers,
    )
    # A depends on C — creates cycle A -> B -> C -> A (when viewed as A must wait for C)
    resp = await client.post(
        f"/api/v1/projects/{proj_id}/tasks/{task_a['id']}/dependencies",
        json={"depends_on_task_id": task_c["id"]},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_project_other_user_forbidden(client: AsyncClient) -> None:
    h1 = await _auth_headers(client, "getowner@example.com")
    h2 = await _auth_headers(client, "getother@example.com")
    create_resp = await client.post("/api/v1/projects/", json={"name": "Secret Project"}, headers=h1)
    project_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}", headers=h2)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_project_includes_phases_and_tasks(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    proj = (await client.post("/api/v1/projects/", json={"name": "Full"}, headers=headers)).json()
    phase = (await client.post(
        f"/api/v1/projects/{proj['id']}/phases",
        json={"name": "Ph"},
        headers=headers,
    )).json()
    await client.post(
        f"/api/v1/projects/{proj['id']}/phases/{phase['id']}/tasks",
        json={"name": "T"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/projects/{proj['id']}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["phases"]) == 1
    assert len(data["phases"][0]["tasks"]) == 1
