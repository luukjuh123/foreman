"""Tests for document management endpoints."""

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


async def _auth_headers(client: AsyncClient, email: str = "test@example.com") -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": email,
        "name": "Test User",
        "password": "testpass123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/v1/projects/", json={
        "name": "Test Project",
        "description": "A test project",
    }, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_upload_document(client, tmp_path):
    """Upload a document to a project."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("contract.pdf", b"fake pdf content", "application/pdf")},
        data={"category": "contract", "description": "Main contract"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "contract.pdf"
    assert data["category"] == "contract"
    assert data["description"] == "Main contract"
    assert data["mime_type"] == "application/pdf"
    assert data["size_bytes"] == len(b"fake pdf content")
    assert data["version"] == 1
    assert data["project_id"] == project_id
    assert "id" in data
    assert "download_url" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_upload_document_default_category(client):
    """Upload a document with default category."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("notes.txt", b"some notes", "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "other"
    assert data["version"] == 1


@pytest.mark.asyncio
async def test_upload_versioning(client):
    """Upload same filename twice — version increments."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    resp1 = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("blueprint.pdf", b"version 1 content", "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )
    assert resp1.status_code == 201
    assert resp1.json()["version"] == 1

    resp2 = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("blueprint.pdf", b"version 2 content", "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )
    assert resp2.status_code == 201
    data2 = resp2.json()
    assert data2["version"] == 2
    assert data2["name"] == "blueprint.pdf"

    # Third upload
    resp3 = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("blueprint.pdf", b"version 3 content", "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )
    assert resp3.status_code == 201
    assert resp3.json()["version"] == 3


@pytest.mark.asyncio
async def test_list_documents_latest_versions(client):
    """List documents returns latest version of each document by default."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    # Upload blueprint twice
    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("blueprint.pdf", b"v1", "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("blueprint.pdf", b"v2", "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )
    # Upload a different file
    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("contract.pdf", b"contract", "application/pdf")},
        data={"category": "contract"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/projects/{project_id}/documents/", headers=headers)
    assert resp.status_code == 200
    items = resp.json()
    # Should return 2 docs (latest of blueprint + contract)
    assert len(items) == 2
    names = {d["name"] for d in items}
    assert names == {"blueprint.pdf", "contract.pdf"}
    blueprint = next(d for d in items if d["name"] == "blueprint.pdf")
    assert blueprint["version"] == 2


@pytest.mark.asyncio
async def test_list_documents_all_versions(client):
    """List all versions when ?all_versions=true."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    for i in range(3):
        await client.post(
            f"/api/v1/projects/{project_id}/documents/",
            files={"file": ("plan.pdf", f"v{i}".encode(), "application/pdf")},
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/?all_versions=true",
        headers=headers,
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 3
    versions = sorted(d["version"] for d in items)
    assert versions == [1, 2, 3]


@pytest.mark.asyncio
async def test_list_documents_filter_by_category(client):
    """Filter documents by category."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("permit.pdf", b"permit", "application/pdf")},
        data={"category": "permit"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("drawing.pdf", b"drawing", "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents/?category=permit",
        headers=headers,
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["category"] == "permit"


@pytest.mark.asyncio
async def test_get_document_metadata(client):
    """Get metadata for a specific document."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("spec.pdf", b"spec content", "application/pdf")},
        data={"category": "contract", "description": "Technical spec"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == doc_id
    assert data["name"] == "spec.pdf"
    assert data["description"] == "Technical spec"
    assert data["category"] == "contract"


@pytest.mark.asyncio
async def test_get_document_not_found(client):
    """404 for nonexistent document."""
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/documents/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_download_document(client):
    """Download file — content matches what was uploaded."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    file_content = b"This is the PDF file content for download test"
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("download_test.pdf", file_content, "application/pdf")},
        data={"category": "contract"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/v1/documents/{doc_id}/download", headers=headers)
    assert resp.status_code == 200
    assert resp.content == file_content


@pytest.mark.asyncio
async def test_get_document_versions(client):
    """List all versions of a document by name+project."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    for i in range(3):
        await client.post(
            f"/api/v1/projects/{project_id}/documents/",
            files={"file": ("versioned.pdf", f"content {i}".encode(), "application/pdf")},
            headers=headers,
        )

    # Get doc_id of the latest
    list_resp = await client.get(f"/api/v1/projects/{project_id}/documents/", headers=headers)
    doc_id = list_resp.json()[0]["id"]

    resp = await client.get(f"/api/v1/documents/{doc_id}/versions", headers=headers)
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) == 3
    version_nums = sorted(v["version"] for v in versions)
    assert version_nums == [1, 2, 3]


@pytest.mark.asyncio
async def test_update_document_metadata(client):
    """PATCH updates name, description, category."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("old_name.pdf", b"content", "application/pdf")},
        data={"category": "other"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"name": "new_name.pdf", "description": "Updated desc", "category": "permit"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "new_name.pdf"
    assert data["description"] == "Updated desc"
    assert data["category"] == "permit"


@pytest.mark.asyncio
async def test_update_document_partial(client):
    """PATCH with only some fields — others unchanged."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("doc.pdf", b"content", "application/pdf")},
        data={"category": "contract", "description": "Original desc"},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"description": "New desc"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["description"] == "New desc"
    assert data["category"] == "contract"
    assert data["name"] == "doc.pdf"


@pytest.mark.asyncio
async def test_delete_document(client):
    """DELETE removes the document — subsequent GET returns 404."""
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents/",
        files={"file": ("to_delete.pdf", b"content", "application/pdf")},
        headers=headers,
    )
    doc_id = upload_resp.json()["id"]

    resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert resp.status_code == 204

    get_resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_to_nonexistent_project(client):
    """Upload to a project that doesn't exist returns 404."""
    headers = await _auth_headers(client)
    resp = await client.post(
        "/api/v1/projects/00000000-0000-0000-0000-000000000000/documents/",
        files={"file": ("test.pdf", b"content", "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_different_projects_independent_versioning(client):
    """Same filename in different projects each start at version 1."""
    headers = await _auth_headers(client)
    project_id_1 = await _create_project(client, headers)
    project_id_2 = await _create_project(client, headers)

    resp1 = await client.post(
        f"/api/v1/projects/{project_id_1}/documents/",
        files={"file": ("plan.pdf", b"p1 content", "application/pdf")},
        headers=headers,
    )
    resp2 = await client.post(
        f"/api/v1/projects/{project_id_2}/documents/",
        files={"file": ("plan.pdf", b"p2 content", "application/pdf")},
        headers=headers,
    )
    assert resp1.json()["version"] == 1
    assert resp2.json()["version"] == 1
