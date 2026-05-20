"""E2E integration tests for critical foreman flows.

Covers:
1. Auth flow: register → login → /me → refresh → /me with new token
2. Project lifecycle: register → create → list → get → update → delete → verify deleted
3. Project with phases and tasks: create project → add phase → add tasks → verify structure
4. AI plan generation: create project with tasks → autofill schedule → verify proposals
5. Material search: test /materials/search with mocked scraper
6. Unauthorized access: create project without token → 401/403
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.stores.base import ProductResult

TEST_DB_URL = "sqlite+aiosqlite://"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        ac._session_factory = app_with_db.state.test_session_factory
        yield ac


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _register(client: AsyncClient, email: str, name: str = "Test User", password: str = "testpass123") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": name,
        "password": password,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return resp.json()


async def _auth_headers(client: AsyncClient, email: str, password: str = "testpass123") -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ---------------------------------------------------------------------------
# 1. Auth flow E2E
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_auth_full_flow(client: AsyncClient) -> None:
    """Register → login → /me → refresh → /me with new token."""
    # Step 1: Register
    reg = await _register(client, "e2e_auth@example.com", name="Auth User")
    assert "access_token" in reg
    assert "refresh_token" in reg
    assert reg["token_type"] == "bearer"

    # Step 2: Login with same credentials
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "e2e_auth@example.com",
        "password": "testpass123",
    })
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    access_token = login_data["access_token"]
    refresh_token = login_data["refresh_token"]

    # Step 3: GET /me with access token
    me_resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "e2e_auth@example.com"
    assert me_data["name"] == "Auth User"
    assert "id" in me_data

    # Step 4: Refresh — exchange refresh token for new access token
    refresh_resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    new_access_token = refresh_resp.json()["access_token"]
    assert new_access_token  # non-empty

    # Step 5: GET /me with the new access token
    me_resp2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access_token}"})
    assert me_resp2.status_code == 200
    assert me_resp2.json()["email"] == "e2e_auth@example.com"


# ---------------------------------------------------------------------------
# 2. Project lifecycle E2E
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_project_lifecycle(client: AsyncClient) -> None:
    """Register → create project → list → get → update → delete → verify deleted."""
    # Register user
    await _register(client, "e2e_project@example.com")
    headers = await _auth_headers(client, "e2e_project@example.com")

    # Create project
    create_resp = await client.post("/api/v1/projects/", json={
        "name": "E2E Project",
        "description": "A test project",
        "status": "active",
        "budget_cents": 500000,
    }, headers=headers)
    assert create_resp.status_code == 201
    project = create_resp.json()
    project_id = project["id"]
    assert project["name"] == "E2E Project"
    assert project["description"] == "A test project"
    assert project["budget_cents"] == 500000
    assert project["status"] == "active"
    assert project["phases"] == []

    # List projects — project must appear
    list_resp = await client.get("/api/v1/projects/", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] == 1
    assert list_data["data"][0]["id"] == project_id
    assert list_data["data"][0]["name"] == "E2E Project"

    # Get project by ID
    get_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert get_resp.status_code == 200
    got = get_resp.json()
    assert got["id"] == project_id
    assert got["name"] == "E2E Project"

    # Update project name and status
    update_resp = await client.put(f"/api/v1/projects/{project_id}", json={
        "name": "E2E Project (Updated)",
        "status": "completed",
    }, headers=headers)
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "E2E Project (Updated)"
    assert updated["status"] == "completed"

    # Verify update persisted via GET
    get_after_update = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert get_after_update.json()["name"] == "E2E Project (Updated)"

    # Delete project
    del_resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verify deleted — GET must 404
    get_deleted = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert get_deleted.status_code == 404

    # Verify list is empty
    list_after_delete = await client.get("/api/v1/projects/", headers=headers)
    assert list_after_delete.json()["total"] == 0


# ---------------------------------------------------------------------------
# 3. Project with phases and tasks E2E
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_project_phases_and_tasks(client: AsyncClient) -> None:
    """Register → create project → add phase → add tasks → verify full structure."""
    await _register(client, "e2e_phases@example.com")
    headers = await _auth_headers(client, "e2e_phases@example.com")

    # Create project
    proj_resp = await client.post("/api/v1/projects/", json={"name": "Phase Project"}, headers=headers)
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # Add a phase
    phase_resp = await client.post(f"/api/v1/projects/{project_id}/phases", json={
        "name": "Foundation",
        "description": "Foundation work",
        "order_index": 0,
        "status": "pending",
    }, headers=headers)
    assert phase_resp.status_code == 201
    phase = phase_resp.json()
    phase_id = phase["id"]
    assert phase["name"] == "Foundation"
    assert phase["tasks"] == []

    # Add first task to the phase
    task1_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json={
            "name": "Dig foundation",
            "description": "Excavate to 1.5m depth",
            "status": "todo",
            "priority": 1,
            "estimated_hours": 16.0,
            "labor_cost_cents": 320000,
        },
        headers=headers,
    )
    assert task1_resp.status_code == 201
    task1 = task1_resp.json()
    task1_id = task1["id"]
    assert task1["name"] == "Dig foundation"
    assert task1["phase_id"] == phase_id
    assert task1["estimated_hours"] == 16.0

    # Add second task to the phase
    task2_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json={
            "name": "Pour concrete",
            "status": "todo",
            "estimated_hours": 8.0,
        },
        headers=headers,
    )
    assert task2_resp.status_code == 201
    task2_id = task2_resp.json()["id"]

    # GET project — verify phases and tasks are embedded
    proj_detail = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert proj_detail.status_code == 200
    proj_data = proj_detail.json()
    assert len(proj_data["phases"]) == 1
    embedded_phase = proj_data["phases"][0]
    assert embedded_phase["id"] == phase_id
    assert embedded_phase["name"] == "Foundation"
    task_ids_in_response = {t["id"] for t in embedded_phase["tasks"]}
    assert task1_id in task_ids_in_response
    assert task2_id in task_ids_in_response

    # Update task status
    update_task_resp = await client.put(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks/{task1_id}",
        json={"status": "in_progress"},
        headers=headers,
    )
    assert update_task_resp.status_code == 200
    assert update_task_resp.json()["status"] == "in_progress"


# ---------------------------------------------------------------------------
# 4. AI plan generation E2E
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_ai_plan_generation(client: AsyncClient) -> None:
    """Create project with tasks → autofill schedule → verify proposals returned."""
    await _register(client, "e2e_planning@example.com")
    headers = await _auth_headers(client, "e2e_planning@example.com")

    # Create project
    proj_resp = await client.post("/api/v1/projects/", json={
        "name": "AI Planning Project",
    }, headers=headers)
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # Add a phase
    phase_resp = await client.post(f"/api/v1/projects/{project_id}/phases", json={
        "name": "Ruwbouw",
        "order_index": 0,
        "status": "pending",
    }, headers=headers)
    assert phase_resp.status_code == 201
    phase_id = phase_resp.json()["id"]

    # Add tasks with estimated hours
    task1_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json={"name": "Fundering graven", "status": "todo", "estimated_hours": 16.0},
        headers=headers,
    )
    assert task1_resp.status_code == 201

    task2_resp = await client.post(
        f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
        json={"name": "Beton storten", "status": "todo", "estimated_hours": 8.0},
        headers=headers,
    )
    assert task2_resp.status_code == 201

    # Call AI autofill endpoint
    autofill_resp = await client.post("/api/v1/planning/autofill", json={
        "project_id": project_id,
        "start_date": "2026-06-01",
        "working_hours_per_day": 8,
    }, headers=headers)
    assert autofill_resp.status_code == 200
    proposals = autofill_resp.json()["proposals"]
    assert len(proposals) == 2

    # Each proposal must have required fields
    for p in proposals:
        assert "task_id" in p
        assert "proposed_start_date" in p
        assert "proposed_end_date" in p
        assert "reasoning" in p
        assert "is_critical" in p
        assert p["proposed_start_date"] >= "2026-06-01"

    # First task should start on or near the start date
    assert proposals[0]["proposed_start_date"] == "2026-06-01"


@pytest.mark.asyncio
async def test_e2e_ai_plan_empty_project(client: AsyncClient) -> None:
    """Autofill on a project with no tasks returns empty proposals."""
    await _register(client, "e2e_plan_empty@example.com")
    headers = await _auth_headers(client, "e2e_plan_empty@example.com")

    proj_resp = await client.post("/api/v1/projects/", json={
        "name": "Empty Project",
    }, headers=headers)
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    autofill_resp = await client.post("/api/v1/planning/autofill", json={
        "project_id": project_id,
    }, headers=headers)
    assert autofill_resp.status_code == 200
    assert autofill_resp.json()["proposals"] == []


# ---------------------------------------------------------------------------
# 5. Material search with mocked scraper
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_material_search_mocked(client: AsyncClient, monkeypatch) -> None:
    """Material search endpoint returns mocked store results correctly."""
    fake_results = [
        ProductResult(
            store="hornbach",
            product_id="h-100",
            name="Beton 25kg",
            url="https://www.hornbach.nl/p/beton/h-100/",
            price_cents=1299,
            in_stock=True,
        ),
        ProductResult(
            store="gamma",
            product_id="g-200",
            name="Beton mix universeel",
            url="https://www.gamma.nl/p/beton/g-200",
            price_cents=999,
            in_stock=False,
        ),
    ]

    async def fake_compare(query, clients, **kwargs):
        return fake_results

    monkeypatch.setattr("app.routers.materials.compare_prices", fake_compare)

    resp = await client.get("/api/v1/materials/search", params={"query": "beton"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["error"] is None
    assert body["query"] == "beton"
    assert len(body["data"]) == 2

    first = body["data"][0]
    assert first["store"] == "hornbach"
    assert first["product_id"] == "h-100"
    assert first["name"] == "Beton 25kg"
    assert first["price_cents"] == 1299
    assert first["in_stock"] is True

    second = body["data"][1]
    assert second["store"] == "gamma"
    assert second["in_stock"] is False


@pytest.mark.asyncio
async def test_e2e_material_search_empty_query(client: AsyncClient, monkeypatch) -> None:
    """Material search with empty query returns valid empty response."""
    async def fake_compare(query, clients, **kwargs):
        return []

    monkeypatch.setattr("app.routers.materials.compare_prices", fake_compare)

    resp = await client.get("/api/v1/materials/search", params={"query": ""})
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["error"] is None


# ---------------------------------------------------------------------------
# 6. Unauthorized access
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_e2e_create_project_without_token(client: AsyncClient) -> None:
    """Creating a project without an auth token must be rejected."""
    resp = await client.post("/api/v1/projects/", json={"name": "Unauthorized Project"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_e2e_get_project_without_token(client: AsyncClient) -> None:
    """Getting a project without a token must be rejected."""
    import uuid
    resp = await client.get(f"/api/v1/projects/{uuid.uuid4()}")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_e2e_get_other_users_project_forbidden(client: AsyncClient) -> None:
    """A user cannot access another user's project."""
    await _register(client, "owner@example.com")
    owner_headers = await _auth_headers(client, "owner@example.com")

    # Owner creates a project
    proj_resp = await client.post("/api/v1/projects/", json={"name": "Owner's Project"}, headers=owner_headers)
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # Second user registers and tries to access the project
    await _register(client, "intruder@example.com")
    intruder_headers = await _auth_headers(client, "intruder@example.com")

    resp = await client.get(f"/api/v1/projects/{project_id}", headers=intruder_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_e2e_update_project_without_token(client: AsyncClient) -> None:
    """Updating a project without a token must be rejected."""
    import uuid
    resp = await client.put(f"/api/v1/projects/{uuid.uuid4()}", json={"name": "Hacked"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_e2e_me_without_token(client: AsyncClient) -> None:
    """GET /me without token must be rejected."""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_e2e_me_with_invalid_token(client: AsyncClient) -> None:
    """GET /me with a garbage token must return 401."""
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code == 401
