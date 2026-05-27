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

    # Override the document storage path to use tmp_path
    from app.core import config
    original_path = config.settings.document_storage_path
    config.settings.document_storage_path = str(tmp_path / "documents")

    yield app

    config.settings.document_storage_path = original_path
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
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> str:
    resp = await client.post("/api/v1/projects/", json={
        "name": name,
        "description": "A test project",
    }, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def _make_file(content: bytes = b"hello world", filename: str = "test.pdf") -> tuple:
    return ("file", (filename, io.BytesIO(content), "application/pdf"))


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_document(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"contract content", "contract.pdf")],
        data={"category": "contract", "description": "Main contract"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "contract.pdf"
    assert data["category"] == "contract"
    assert data["description"] == "Main contract"
    assert data["version"] == 1
    assert data["parent_id"] is None
    assert data["project_id"] == project_id
    assert data["size_bytes"] == len(b"contract content")
    assert "id" in data


@pytest.mark.asyncio
async def test_upload_document_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file()],
        data={"category": "other"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_document_wrong_project_owner(client: AsyncClient) -> None:
    headers_a = await _auth_headers(client, "user_a@example.com")
    headers_b = await _auth_headers(client, "user_b@example.com")
    project_id = await _create_project(client, headers_a)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file()],
        data={"category": "other"},
        headers=headers_b,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_upload_document_file_size_limit(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    # 50MB + 1 byte exceeds limit
    big_content = b"x" * (50 * 1024 * 1024 + 1)
    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("file", ("big.pdf", io.BytesIO(big_content), "application/pdf"))],
        data={"category": "other"},
        headers=headers,
    )
    assert resp.status_code == 413


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_documents(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    # Upload two documents
    await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"contract", "c.pdf")],
        data={"category": "contract"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"permit", "p.pdf")],
        data={"category": "permit"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/documents", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_documents_filter_by_category(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"contract", "c.pdf")],
        data={"category": "contract"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"permit", "p.pdf")],
        data={"category": "permit"},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents?category=contract",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["category"] == "contract"


@pytest.mark.asyncio
async def test_list_documents_excludes_deleted(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"content", "doc.pdf")],
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    await client.delete(f"/api/v1/projects/{project_id}/documents/{doc_id}", headers=headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/documents", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Get metadata
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_document_metadata(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"drawing data", "floor_plan.dwg")],
        data={"category": "drawing", "description": "Floor plan"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/documents/{doc_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == doc_id
    assert data["name"] == "floor_plan.dwg"
    assert data["category"] == "drawing"


@pytest.mark.asyncio
async def test_get_document_not_found(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/00000000-0000-0000-0000-000000000000",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_document_wrong_owner(client: AsyncClient) -> None:
    headers_a = await _auth_headers(client, "owner2@example.com")
    headers_b = await _auth_headers(client, "other2@example.com")
    project_id = await _create_project(client, headers_a)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file()],
        data={"category": "other"},
        headers=headers_a,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/documents/{doc_id}", headers=headers_b)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_document(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    file_content = b"PDF content here"
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("file", ("report.pdf", io.BytesIO(file_content), "application/pdf"))],
        data={"category": "contract"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/download",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.content == file_content


# ---------------------------------------------------------------------------
# Versioning
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_new_version(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    v1_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"version 1", "contract.pdf")],
        data={"category": "contract"},
        headers=headers,
    )
    doc_id = v1_resp.json()["id"]

    v2_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/versions",
        files=[_make_file(b"version 2", "contract_v2.pdf")],
        data={"description": "Updated contract"},
        headers=headers,
    )
    assert v2_resp.status_code == 201
    v2 = v2_resp.json()
    assert v2["version"] == 2
    assert v2["parent_id"] == doc_id
    assert v2["name"] == "contract_v2.pdf"
    assert v2["category"] == "contract"  # inherits category from parent


@pytest.mark.asyncio
async def test_list_versions(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    v1_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file(b"v1", "doc.pdf")],
        data={"category": "permit"},
        headers=headers,
    )
    doc_id = v1_resp.json()["id"]

    await client.post(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/versions",
        files=[_make_file(b"v2", "doc_v2.pdf")],
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/versions",
        files=[_make_file(b"v3", "doc_v3.pdf")],
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/versions",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    versions = [d["version"] for d in data]
    assert sorted(versions) == [1, 2, 3]


# ---------------------------------------------------------------------------
# Delete (soft)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_document_soft(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file()],
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
        headers=headers,
    )
    assert del_resp.status_code == 204

    # Should be gone from get
    get_resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
        headers=headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_document_requires_auth(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[_make_file()],
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{doc_id}")
    assert resp.status_code == 401
