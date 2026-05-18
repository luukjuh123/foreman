"""Tests for Process templates and ProjectProcess attachments."""

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


async def _auth(client: AsyncClient, email: str = "u@example.com") -> dict:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "U", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _make_project(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Process templates
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_process(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post(
        "/api/v1/processes/",
        json={"slug": "stucen", "name": "Stucen", "unit": "m2"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["slug"] == "stucen"
    assert data["name"] == "Stucen"
    assert data["unit"] == "m2"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_process_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/api/v1/processes/", json={"slug": "x", "name": "X"})
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_process_duplicate_slug_conflict(client: AsyncClient) -> None:
    headers = await _auth(client)
    body = {"slug": "tegelen", "name": "Tegelen"}
    r1 = await client.post("/api/v1/processes/", json=body, headers=headers)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/processes/", json=body, headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_create_process_invalid_slug(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post(
        "/api/v1/processes/",
        json={"slug": "Has Spaces", "name": "Bad"},
        headers=headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_list_processes(client: AsyncClient) -> None:
    headers = await _auth(client)
    for slug in ("schilderen", "stucen", "tegelen"):
        await client.post(
            "/api/v1/processes/",
            json={"slug": slug, "name": slug.capitalize()},
            headers=headers,
        )
    r = await client.get("/api/v1/processes/", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    slugs = [p["slug"] for p in body["data"]]
    assert slugs == ["schilderen", "stucen", "tegelen"]  # ordered by slug


@pytest.mark.asyncio
async def test_get_process_by_id(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post(
        "/api/v1/processes/",
        json={"slug": "metselen", "name": "Metselen"},
        headers=headers,
    )
    pid = r.json()["id"]
    r2 = await client.get(f"/api/v1/processes/{pid}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["slug"] == "metselen"


@pytest.mark.asyncio
async def test_get_process_not_found(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.get(
        "/api/v1/processes/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_process(client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.post(
        "/api/v1/processes/",
        json={"slug": "schilderen", "name": "Schilderen", "unit": "m2"},
        headers=headers,
    )
    pid = r.json()["id"]
    r2 = await client.put(
        f"/api/v1/processes/{pid}",
        json={"name": "Painting", "unit": "m"},
        headers=headers,
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["name"] == "Painting"
    assert body["unit"] == "m"
    assert body["slug"] == "schilderen"  # slug not changeable through update


# ---------------------------------------------------------------------------
# Project ↔ Process attachments
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_attach_process_to_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    proc = await client.post(
        "/api/v1/processes/",
        json={"slug": "stucen", "name": "Stucen"},
        headers=headers,
    )
    process_id = proc.json()["id"]
    r = await client.post(
        f"/api/v1/processes/projects/{project_id}",
        json={"process_id": process_id, "notes": "Living room"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["project_id"] == project_id
    assert body["process_id"] == process_id
    assert body["notes"] == "Living room"
    assert body["process"]["slug"] == "stucen"


@pytest.mark.asyncio
async def test_list_project_processes(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    for slug in ("a", "b"):
        proc = await client.post(
            "/api/v1/processes/",
            json={"slug": slug, "name": slug.upper()},
            headers=headers,
        )
        await client.post(
            f"/api/v1/processes/projects/{project_id}",
            json={"process_id": proc.json()["id"]},
            headers=headers,
        )
    r = await client.get(f"/api/v1/processes/projects/{project_id}", headers=headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) == 2


@pytest.mark.asyncio
async def test_attach_duplicate_returns_conflict(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    proc = await client.post(
        "/api/v1/processes/",
        json={"slug": "stucen", "name": "Stucen"},
        headers=headers,
    )
    pid = proc.json()["id"]
    body = {"process_id": pid}
    r1 = await client.post(
        f"/api/v1/processes/projects/{project_id}", json=body, headers=headers
    )
    assert r1.status_code == 201
    r2 = await client.post(
        f"/api/v1/processes/projects/{project_id}", json=body, headers=headers
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_detach_process_from_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    proc = await client.post(
        "/api/v1/processes/",
        json={"slug": "stucen", "name": "Stucen"},
        headers=headers,
    )
    link = await client.post(
        f"/api/v1/processes/projects/{project_id}",
        json={"process_id": proc.json()["id"]},
        headers=headers,
    )
    pp_id = link.json()["id"]
    r = await client.delete(
        f"/api/v1/processes/projects/{project_id}/{pp_id}", headers=headers
    )
    assert r.status_code == 204
    r2 = await client.get(f"/api/v1/processes/projects/{project_id}", headers=headers)
    assert r2.json()["data"] == []


@pytest.mark.asyncio
async def test_cannot_attach_to_other_users_project(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    project_id = await _make_project(client, h1)
    h2 = await _auth(client, "intruder@example.com")
    proc = await client.post(
        "/api/v1/processes/",
        json={"slug": "stucen", "name": "Stucen"},
        headers=h2,
    )
    r = await client.post(
        f"/api/v1/processes/projects/{project_id}",
        json={"process_id": proc.json()["id"]},
        headers=h2,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_attach_unknown_process_returns_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    r = await client.post(
        f"/api/v1/processes/projects/{project_id}",
        json={"process_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert r.status_code == 404
