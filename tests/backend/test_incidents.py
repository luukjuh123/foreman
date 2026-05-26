"""Tests for Incident model + CRUD endpoints."""

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


@pytest.mark.asyncio
async def test_create_incident_minimal(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Worker slipped",
            "description": "Worker slipped on wet surface near entrance",
            "severity": "medium",
            "category": "injury",
            "incident_date": "2026-05-20",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "Worker slipped"
    assert body["severity"] == "medium"
    assert body["category"] == "injury"
    assert body["status"] == "reported"
    assert body["incident_date"] == "2026-05-20"
    assert body["damage_cost_cents"] == 0
    assert body["project_id"] is None


@pytest.mark.asyncio
async def test_create_incident_all_fields(client: AsyncClient) -> None:
    headers = await _auth(client)
    # Create a project first
    proj_resp = await client.post(
        "/api/v1/projects/",
        json={"name": "Bouwplaats A", "description": "Test project"},
        headers=headers,
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Scaffold collapse",
            "description": "Section of scaffolding gave way",
            "severity": "critical",
            "category": "property_damage",
            "incident_date": "2026-05-19",
            "incident_time": "14:30",
            "location": "Level 3, east wing",
            "reported_by": "Henk de Vries",
            "witnesses": "Jan Bakker, Piet Smit",
            "corrective_action": "Scaffold inspected and repaired",
            "damage_cost_cents": 250000,
            "project_id": project_id,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["severity"] == "critical"
    assert body["category"] == "property_damage"
    assert body["incident_time"] == "14:30"
    assert body["location"] == "Level 3, east wing"
    assert body["reported_by"] == "Henk de Vries"
    assert body["witnesses"] == "Jan Bakker, Piet Smit"
    assert body["corrective_action"] == "Scaffold inspected and repaired"
    assert body["damage_cost_cents"] == 250000
    assert body["project_id"] == project_id


@pytest.mark.asyncio
async def test_list_incidents_owner_scoped(client: AsyncClient) -> None:
    h1 = await _auth(client, "a@example.com")
    h2 = await _auth(client, "b@example.com")
    await client.post(
        "/api/v1/incidents/",
        json={
            "title": "A's incident",
            "description": "desc",
            "severity": "low",
            "category": "near_miss",
            "incident_date": "2026-05-01",
        },
        headers=h1,
    )
    await client.post(
        "/api/v1/incidents/",
        json={
            "title": "B's incident",
            "description": "desc",
            "severity": "high",
            "category": "theft",
            "incident_date": "2026-05-02",
        },
        headers=h2,
    )
    resp = await client.get("/api/v1/incidents/", headers=h1)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["title"] == "A's incident"


@pytest.mark.asyncio
async def test_list_incidents_filter_severity(client: AsyncClient) -> None:
    headers = await _auth(client)
    for sev in ("low", "medium", "high"):
        await client.post(
            "/api/v1/incidents/",
            json={
                "title": f"{sev} incident",
                "description": "desc",
                "severity": sev,
                "category": "other",
                "incident_date": "2026-05-01",
            },
            headers=headers,
        )
    resp = await client.get("/api/v1/incidents/?severity=high", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["severity"] == "high"


@pytest.mark.asyncio
async def test_list_incidents_filter_category(client: AsyncClient) -> None:
    headers = await _auth(client)
    for cat in ("injury", "theft", "environmental"):
        await client.post(
            "/api/v1/incidents/",
            json={
                "title": f"{cat} incident",
                "description": "desc",
                "severity": "low",
                "category": cat,
                "incident_date": "2026-05-01",
            },
            headers=headers,
        )
    resp = await client.get("/api/v1/incidents/?category=theft", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["data"][0]["category"] == "theft"


@pytest.mark.asyncio
async def test_list_incidents_filter_status(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Open incident",
            "description": "desc",
            "severity": "low",
            "category": "other",
            "incident_date": "2026-05-01",
        },
        headers=headers,
    )
    inc_id = resp.json()["id"]
    await client.put(
        f"/api/v1/incidents/{inc_id}",
        json={"status": "resolved"},
        headers=headers,
    )

    resp = await client.get("/api/v1/incidents/?status=reported", headers=headers)
    assert resp.json()["total"] == 0

    resp = await client.get("/api/v1/incidents/?status=resolved", headers=headers)
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_get_incident_by_id(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Near miss",
            "description": "Crane load swung close to worker",
            "severity": "high",
            "category": "near_miss",
            "incident_date": "2026-05-10",
        },
        headers=headers,
    )
    inc_id = resp.json()["id"]
    resp = await client.get(f"/api/v1/incidents/{inc_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == inc_id
    assert resp.json()["title"] == "Near miss"


@pytest.mark.asyncio
async def test_update_incident_status_to_resolved(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Equipment theft",
            "description": "Drill stolen from site storage",
            "severity": "medium",
            "category": "theft",
            "incident_date": "2026-05-15",
        },
        headers=headers,
    )
    inc_id = resp.json()["id"]

    resp = await client.put(
        f"/api/v1/incidents/{inc_id}",
        json={"status": "resolved", "corrective_action": "Police report filed"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "resolved"
    assert body["corrective_action"] == "Police report filed"
    assert body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_delete_incident(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Minor cut",
            "description": "Worker cut finger on sheet metal",
            "severity": "low",
            "category": "injury",
            "incident_date": "2026-05-18",
        },
        headers=headers,
    )
    inc_id = resp.json()["id"]

    resp = await client.delete(f"/api/v1/incidents/{inc_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/v1/incidents/{inc_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stats_endpoint(client: AsyncClient) -> None:
    headers = await _auth(client)
    incidents = [
        ("low", "injury", 0),
        ("low", "near_miss", 0),
        ("high", "injury", 100000),
        ("critical", "property_damage", 500000),
    ]
    for sev, cat, cost in incidents:
        await client.post(
            "/api/v1/incidents/",
            json={
                "title": f"{sev} {cat}",
                "description": "desc",
                "severity": sev,
                "category": cat,
                "incident_date": "2026-05-01",
                "damage_cost_cents": cost,
            },
            headers=headers,
        )

    resp = await client.get("/api/v1/incidents/stats", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_incidents"] == 4
    assert body["by_severity"]["low"] == 2
    assert body["by_severity"]["high"] == 1
    assert body["by_severity"]["critical"] == 1
    assert body["by_category"]["injury"] == 2
    assert body["by_category"]["near_miss"] == 1
    assert body["by_category"]["property_damage"] == 1
    assert body["total_damage_cost_cents"] == 600000


@pytest.mark.asyncio
async def test_severity_validation_rejects_invalid(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Bad incident",
            "description": "desc",
            "severity": "catastrophic",  # invalid
            "category": "injury",
            "incident_date": "2026-05-01",
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_category_validation_rejects_invalid(client: AsyncClient) -> None:
    headers = await _auth(client)
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Bad category",
            "description": "desc",
            "severity": "low",
            "category": "earthquake",  # invalid
            "incident_date": "2026-05-01",
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_owner_isolation_get(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "other@example.com")
    resp = await client.post(
        "/api/v1/incidents/",
        json={
            "title": "Private incident",
            "description": "desc",
            "severity": "low",
            "category": "other",
            "incident_date": "2026-05-01",
        },
        headers=h1,
    )
    inc_id = resp.json()["id"]

    resp = await client.get(f"/api/v1/incidents/{inc_id}", headers=h2)
    assert resp.status_code == 404

    resp = await client.put(
        f"/api/v1/incidents/{inc_id}",
        json={"title": "Hijacked"},
        headers=h2,
    )
    assert resp.status_code == 404

    resp = await client.delete(f"/api/v1/incidents/{inc_id}", headers=h2)
    assert resp.status_code == 404
