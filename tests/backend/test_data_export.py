"""Tests for the data export API — full project archive as ZIP.

GET /api/v1/projects/{project_id}/export returns a ZIP file containing:
- project.json  — project metadata (phases, tasks)
- invoices.json — all invoices linked to the project
- reports.json  — all reports for the project
- photos.json   — metadata for all process photos (not binary blobs)
"""

import io
import json
import uuid
import zipfile

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
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={"name": "Export User", "email": "export@test.com", "password": "Exp0rtP@ss!"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "export@test.com", "password": "Exp0rtP@ss!"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def project_id(client: AsyncClient, auth_headers: dict) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": "Export Test Project", "description": "For export testing"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestDataExportAPI:
    @pytest.mark.asyncio
    async def test_export_returns_zip_content_type(self, client: AsyncClient, auth_headers: dict, project_id: str) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200
        assert "application/zip" in resp.headers["content-type"]

    @pytest.mark.asyncio
    async def test_export_content_disposition_has_filename(self, client: AsyncClient, auth_headers: dict, project_id: str) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200
        assert "content-disposition" in resp.headers
        assert "attachment" in resp.headers["content-disposition"]
        assert ".zip" in resp.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_export_zip_contains_project_json(self, client: AsyncClient, auth_headers: dict, project_id: str) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "project.json" in zf.namelist()
            data = json.loads(zf.read("project.json"))
            assert data["id"] == project_id
            assert data["name"] == "Export Test Project"

    @pytest.mark.asyncio
    async def test_export_zip_contains_invoices_json(self, client: AsyncClient, auth_headers: dict, project_id: str) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "invoices.json" in zf.namelist()
            data = json.loads(zf.read("invoices.json"))
            assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_export_zip_contains_reports_json(self, client: AsyncClient, auth_headers: dict, project_id: str) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "reports.json" in zf.namelist()
            data = json.loads(zf.read("reports.json"))
            assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_export_zip_contains_photos_json(self, client: AsyncClient, auth_headers: dict, project_id: str) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "photos.json" in zf.namelist()
            data = json.loads(zf.read("photos.json"))
            assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_export_requires_auth(self, client: AsyncClient, project_id: str, auth_headers: dict) -> None:
        resp = await client.get(f"/api/v1/projects/{project_id}/export")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_export_returns_404_for_nonexistent_project(self, client: AsyncClient, auth_headers: dict) -> None:
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"/api/v1/projects/{fake_id}/export", headers=auth_headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_export_project_json_includes_phases_and_tasks(
        self, client: AsyncClient, auth_headers: dict, project_id: str
    ) -> None:
        # Add a phase and task
        phase_resp = await client.post(
            f"/api/v1/projects/{project_id}/phases",
            json={"name": "Fase 1", "order_index": 0},
            headers=auth_headers,
        )
        phase_id = phase_resp.json()["id"]
        await client.post(
            f"/api/v1/projects/{project_id}/phases/{phase_id}/tasks",
            json={"name": "Taak 1"},
            headers=auth_headers,
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            data = json.loads(zf.read("project.json"))
            assert len(data.get("phases", [])) >= 1
            tasks = data["phases"][0].get("tasks", [])
            assert len(tasks) >= 1
