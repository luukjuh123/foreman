"""Tests for document management — upload/download contracts, permits, drawings per project."""

from __future__ import annotations

import io
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def app_with_db(tmp_path):
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # Point uploads at tmp_path so tests don't write to the real filesystem
    from app.core import config as cfg
    original = cfg.settings.document_storage_path
    cfg.settings.document_storage_path = str(tmp_path / "uploads")

    yield app

    cfg.settings.document_storage_path = original
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(transport=ASGITransport(app=app_with_db), base_url="http://test") as ac:
        yield ac


async def _auth_headers(client: AsyncClient, email: str = "doc@example.com") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> str:
    resp = await client.post("/api/v1/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def _pdf_file(content: bytes = b"hello world", filename: str = "test.pdf"):
    return ("file", (filename, io.BytesIO(content), "application/pdf"))


# ---------------------------------------------------------------------------
# Upload — metadata returned correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_document_returns_metadata(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file(b"contract content", "contract.pdf")],
        data={"category": "contract", "description": "Main contract"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["filename"] == "contract.pdf"
    assert data["category"] == "contract"
    assert data["description"] == "Main contract"
    assert data["version"] == 1
    assert data["project_id"] == project_id
    assert data["file_size_bytes"] == len(b"contract content")
    assert "id" in data
    assert "storage_path" in data
    assert "content_type" in data
    assert "uploaded_by" in data


@pytest.mark.asyncio
async def test_upload_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file()],
        data={"category": "other"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_wrong_project_owner_returns_403(client: AsyncClient) -> None:
    h_a = await _auth_headers(client, "owner@example.com")
    h_b = await _auth_headers(client, "other@example.com")
    project_id = await _create_project(client, h_a)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file()],
        data={"category": "other"},
        headers=h_b,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Versioning — same filename increments version
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_same_filename_twice_increments_version(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    r1 = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file(b"v1 content", "contract.pdf")],
        data={"category": "contract"},
        headers=headers,
    )
    assert r1.status_code == 201
    assert r1.json()["version"] == 1

    r2 = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file(b"v2 content", "contract.pdf")],
        data={"category": "contract"},
        headers=headers,
    )
    assert r2.status_code == 201
    assert r2.json()["version"] == 2


@pytest.mark.asyncio
async def test_version_is_per_project_not_global(client: AsyncClient) -> None:
    """Same filename in different projects each start at version 1."""
    headers = await _auth_headers(client)
    proj_a = await _create_project(client, headers, "Project A")
    proj_b = await _create_project(client, headers, "Project B")

    r_a = await client.post(
        f"/api/v1/projects/{proj_a}/documents/",
        files=[_pdf_file(b"a", "doc.pdf")],
        data={"category": "other"},
        headers=headers,
    )
    r_b = await client.post(
        f"/api/v1/projects/{proj_b}/documents/",
        files=[_pdf_file(b"b", "doc.pdf")],
        data={"category": "other"},
        headers=headers,
    )
    assert r_a.json()["version"] == 1
    assert r_b.json()["version"] == 1


# ---------------------------------------------------------------------------
# List — paginated, filterable by category
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_documents_returns_all(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    for name, cat in [("c.pdf", "contract"), ("p.pdf", "permit"), ("d.pdf", "drawing")]:
        await client.post(
            f"/api/v1/projects/{project_id}/documents/",
            files=[_pdf_file(b"x", name)],
            data={"category": cat},
            headers=headers,
        )

    resp = await client.get(f"/api/v1/projects/{project_id}/documents/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


@pytest.mark.asyncio
async def test_list_documents_filter_by_category(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file(b"c", "c.pdf")],
        data={"category": "contract"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file(b"p", "p.pdf")],
        data={"category": "permit"},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/?category=contract",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["category"] == "contract"


@pytest.mark.asyncio
async def test_list_documents_pagination(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    for i in range(5):
        await client.post(
            f"/api/v1/projects/{project_id}/documents/",
            files=[_pdf_file(b"x", f"file{i}.pdf")],
            data={"category": "other"},
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/?page=1&per_page=2",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5


# ---------------------------------------------------------------------------
# Get document metadata
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_document_metadata(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file(b"drawing data", "floor_plan.pdf")],
        data={"category": "drawing", "description": "Floor plan"},
        headers=headers,
    )
    doc_id = upload.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/documents/{doc_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == doc_id
    assert data["filename"] == "floor_plan.pdf"
    assert data["category"] == "drawing"
    assert data["description"] == "Floor plan"


@pytest.mark.asyncio
async def test_get_document_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/00000000-0000-0000-0000-000000000000",
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Download — streams file content
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_download_returns_file_content(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    file_content = b"PDF bytes here"
    upload = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[("file", ("report.pdf", io.BytesIO(file_content), "application/pdf"))],
        data={"category": "contract"},
        headers=headers,
    )
    doc_id = upload.json()["id"]

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/download",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.content == file_content


@pytest.mark.asyncio
async def test_download_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file()],
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/documents/{doc_id}/download")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Delete — removes document
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_document(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file()],
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
        headers=headers,
    )
    assert del_resp.status_code == 204

    # No longer accessible
    get_resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
        headers=headers,
    )
    assert get_resp.status_code == 404

    # Not in list either
    list_resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/",
        headers=headers,
    )
    assert list_resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files=[_pdf_file()],
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload.json()["id"]

    resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{doc_id}")
    assert resp.status_code == 401
