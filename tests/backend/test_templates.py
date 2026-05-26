"""Tests for ProjectTemplate endpoints — project templates with phase/task structures."""

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


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


SAMPLE_STRUCTURE = [
    {
        "name": "Sloopwerk",
        "description": "Bestaande badkamer slopen",
        "order_index": 0,
        "tasks": [
            {"name": "Tegels verwijderen", "description": None, "estimated_hours": 8.0, "priority": 1},
            {"name": "Leidingwerk strippen", "description": None, "estimated_hours": 4.0, "priority": 2},
        ],
    },
    {
        "name": "Installatie",
        "description": "Nieuwe installaties",
        "order_index": 1,
        "tasks": [
            {"name": "Leidingwerk aanleggen", "description": None, "estimated_hours": 6.0, "priority": 1},
        ],
    },
]


# ---------------------------------------------------------------------------
# Create template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_template_manual(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/templates/",
        json={
            "name": "Badkamer renovatie standaard",
            "description": "Standaard badkamer renovatie template",
            "category": "renovatie",
            "structure": SAMPLE_STRUCTURE,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Badkamer renovatie standaard"
    assert body["category"] == "renovatie"
    assert len(body["structure"]) == 2
    assert body["structure"][0]["name"] == "Sloopwerk"
    assert len(body["structure"][0]["tasks"]) == 2
    assert "id" in body
    assert "created_at" in body


# ---------------------------------------------------------------------------
# List templates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_templates_owner_scoped(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@example.com")
    h2 = await _auth(client, "b@example.com")
    await client.post(
        "/api/v1/templates/",
        json={"name": "Template A", "structure": SAMPLE_STRUCTURE},
        headers=h1,
    )
    await client.post(
        "/api/v1/templates/",
        json={"name": "Template B", "structure": SAMPLE_STRUCTURE},
        headers=h2,
    )
    resp = await client.get("/api/v1/templates/", headers=h1)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["name"] == "Template A"


@pytest.mark.asyncio
async def test_list_templates_pagination(client: AsyncClient) -> None:
    headers = await _auth(client)
    for i in range(5):
        await client.post(
            "/api/v1/templates/",
            json={"name": f"Template {i}", "structure": []},
            headers=headers,
        )
    resp = await client.get("/api/v1/templates/?page=1&per_page=3", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 5
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_list_templates_category_filter(client: AsyncClient) -> None:
    headers = await _auth(client)
    await client.post(
        "/api/v1/templates/",
        json={"name": "Badkamer", "category": "renovatie", "structure": []},
        headers=headers,
    )
    await client.post(
        "/api/v1/templates/",
        json={"name": "Dakkapel", "category": "verbouw", "structure": []},
        headers=headers,
    )
    resp = await client.get("/api/v1/templates/?category=renovatie", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["name"] == "Badkamer"


# ---------------------------------------------------------------------------
# Get template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_template(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/templates/",
        json={"name": "Test Template", "structure": SAMPLE_STRUCTURE},
        headers=headers,
    )
    tid = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/templates/{tid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == tid
    assert resp.json()["name"] == "Test Template"


@pytest.mark.asyncio
async def test_get_template_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    import uuid
    resp = await client.get(f"/api/v1/templates/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_template(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/templates/",
        json={"name": "Old Name", "category": "renovatie", "structure": []},
        headers=headers,
    )
    tid = create_resp.json()["id"]
    resp = await client.put(
        f"/api/v1/templates/{tid}",
        json={"name": "New Name", "category": "verbouw"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["category"] == "verbouw"


# ---------------------------------------------------------------------------
# Delete template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_template(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/templates/",
        json={"name": "To Delete", "structure": []},
        headers=headers,
    )
    tid = create_resp.json()["id"]
    resp = await client.delete(f"/api/v1/templates/{tid}", headers=headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/v1/templates/{tid}", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Create template from existing project
# ---------------------------------------------------------------------------


async def _create_project_with_phases(client: AsyncClient, headers: dict) -> str:
    """Create a project with phases and tasks, return project id."""
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": "Badkamer verbouwing", "status": "active"},
        headers=headers,
    )
    pid = resp.json()["id"]

    phase_resp = await client.post(
        f"/api/v1/projects/{pid}/phases",
        json={"name": "Sloopfase", "description": "Slopen", "order_index": 0},
        headers=headers,
    )
    phase_id = phase_resp.json()["id"]

    await client.post(
        f"/api/v1/projects/{pid}/phases/{phase_id}/tasks",
        json={"name": "Tegels verwijderen", "estimated_hours": 8.0, "priority": 1},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{pid}/phases/{phase_id}/tasks",
        json={"name": "Afvoer strippen", "estimated_hours": 3.0, "priority": 2},
        headers=headers,
    )
    return pid


@pytest.mark.asyncio
async def test_create_template_from_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    pid = await _create_project_with_phases(client, headers)

    resp = await client.post(
        f"/api/v1/templates/from-project/{pid}",
        json={"name": "Badkamer template", "category": "renovatie"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Badkamer template"
    assert body["category"] == "renovatie"
    assert len(body["structure"]) == 1
    phase = body["structure"][0]
    assert phase["name"] == "Sloopfase"
    assert len(phase["tasks"]) == 2
    task_names = [t["name"] for t in phase["tasks"]]
    assert "Tegels verwijderen" in task_names


@pytest.mark.asyncio
async def test_create_template_from_project_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    import uuid
    resp = await client.post(
        f"/api/v1/templates/from-project/{uuid.uuid4()}",
        json={"name": "Template"},
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Instantiate project from template
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_instantiate_project_from_template(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/templates/",
        json={
            "name": "Badkamer renovatie",
            "structure": SAMPLE_STRUCTURE,
        },
        headers=headers,
    )
    tid = create_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/templates/{tid}/instantiate",
        json={"project_name": "Klant De Vries - Badkamer", "start_date": "2026-06-01"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Klant De Vries - Badkamer"
    assert body["start_date"] == "2026-06-01"
    assert len(body["phases"]) == 2
    sloopwerk = next(p for p in body["phases"] if p["name"] == "Sloopwerk")
    assert len(sloopwerk["tasks"]) == 2
    task_names = [t["name"] for t in sloopwerk["tasks"]]
    assert "Tegels verwijderen" in task_names
    assert "Leidingwerk strippen" in task_names


@pytest.mark.asyncio
async def test_instantiate_preserves_task_hours_and_priority(client: AsyncClient) -> None:
    headers = await _auth(client)
    create_resp = await client.post(
        "/api/v1/templates/",
        json={"name": "T", "structure": SAMPLE_STRUCTURE},
        headers=headers,
    )
    tid = create_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/templates/{tid}/instantiate",
        json={"project_name": "Project X"},
        headers=headers,
    )
    assert resp.status_code == 201
    phases = resp.json()["phases"]
    sloopwerk = next(p for p in phases if p["name"] == "Sloopwerk")
    tegels = next(t for t in sloopwerk["tasks"] if t["name"] == "Tegels verwijderen")
    assert tegels["estimated_hours"] == 8.0
    assert tegels["priority"] == 1


@pytest.mark.asyncio
async def test_instantiate_template_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    import uuid
    resp = await client.post(
        f"/api/v1/templates/{uuid.uuid4()}/instantiate",
        json={"project_name": "Project X"},
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Owner isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_owner_isolation(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "thief@example.com")
    create_resp = await client.post(
        "/api/v1/templates/",
        json={"name": "Private Template", "structure": []},
        headers=h1,
    )
    tid = create_resp.json()["id"]

    assert (await client.get(f"/api/v1/templates/{tid}", headers=h2)).status_code == 404
    assert (
        await client.put(f"/api/v1/templates/{tid}", json={"name": "Hacked"}, headers=h2)
    ).status_code == 404
    assert (await client.delete(f"/api/v1/templates/{tid}", headers=h2)).status_code == 404
    assert (
        await client.post(
            f"/api/v1/templates/{tid}/instantiate",
            json={"project_name": "Stolen"},
            headers=h2,
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/templates/")).status_code in (401, 403)
