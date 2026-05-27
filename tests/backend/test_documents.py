"""Tests for Document management — upload/download/versioning per project."""

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

    # Override the upload directory to use a temp path
    from app.core import config as cfg

    original_upload_dir = cfg.settings.upload_dir
    cfg.settings.upload_dir = str(tmp_path / "uploads")

    yield app

    cfg.settings.upload_dir = original_upload_dir
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


async def _auth(client: AsyncClient, email: str = "boss@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Boss", "password": "supersecret"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(
    client: AsyncClient, headers: dict, name: str = "Test Project"
) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={"name": name, "description": "A test project"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _make_file(
    content: bytes = b"fake pdf content", filename: str = "contract.pdf"
) -> dict:
    return {"file": (filename, io.BytesIO(content), "application/pdf")}


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_document(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(),
        data={"category": "contract", "description": "Signed contract"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["filename"] == "contract.pdf"
    assert body["category"] == "contract"
    assert body["version"] == 1
    assert body["parent_id"] is None
    assert body["project_id"] == project_id
    assert body["size_bytes"] > 0


@pytest.mark.asyncio
async def test_upload_requires_auth(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(),
        data={"category": "permit"},
    )
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_documents_for_project(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    for name, cat in [("a.pdf", "contract"), ("b.pdf", "permit"), ("c.pdf", "drawing")]:
        await client.post(
            f"/api/v1/projects/{project_id}/documents",
            files={"file": (name, io.BytesIO(b"data"), "application/pdf")},
            data={"category": cat},
            headers=headers,
        )

    resp = await client.get(f"/api/v1/projects/{project_id}/documents", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_list_documents_filter_by_category(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    for name, cat in [
        ("a.pdf", "contract"),
        ("b.pdf", "permit"),
        ("c.pdf", "contract"),
    ]:
        await client.post(
            f"/api/v1/projects/{project_id}/documents",
            files={"file": (name, io.BytesIO(b"data"), "application/pdf")},
            data={"category": cat},
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/projects/{project_id}/documents?category=contract",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert all(d["category"] == "contract" for d in body["data"])


@pytest.mark.asyncio
async def test_list_documents_excludes_deleted(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(),
        data={"category": "permit"},
        headers=headers,
    )
    doc_id = resp.json()["id"]

    await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/documents", headers=headers)
    assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Get metadata
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_document_metadata(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    upload = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(filename="permit.pdf"),
        data={"category": "permit", "description": "Building permit"},
        headers=headers,
    )
    doc_id = upload.json()["id"]

    resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == doc_id
    assert body["filename"] == "permit.pdf"
    assert body["description"] == "Building permit"


@pytest.mark.asyncio
async def test_get_document_404(client: AsyncClient) -> None:
    import uuid

    headers = await _auth(client)
    resp = await client.get(f"/api/v1/documents/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_document(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    content = b"PDF file content here"
    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files={"file": ("drawing.pdf", io.BytesIO(content), "application/pdf")},
        data={"category": "drawing"},
        headers=headers,
    )
    doc_id = resp.json()["id"]

    resp = await client.get(f"/api/v1/documents/{doc_id}/download", headers=headers)
    assert resp.status_code == 200
    assert resp.content == content


# ---------------------------------------------------------------------------
# Versioning
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_new_version(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    v1_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(b"version 1 content"),
        data={"category": "contract"},
        headers=headers,
    )
    doc_id = v1_resp.json()["id"]
    assert v1_resp.json()["version"] == 1

    v2_resp = await client.post(
        f"/api/v1/documents/{doc_id}/versions",
        files=_make_file(b"version 2 content"),
        headers=headers,
    )
    assert v2_resp.status_code == 201, v2_resp.text
    v2 = v2_resp.json()
    assert v2["version"] == 2
    assert v2["parent_id"] == doc_id
    assert v2["filename"] == "contract.pdf"


@pytest.mark.asyncio
async def test_list_versions(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    v1_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(b"v1"),
        data={"category": "contract"},
        headers=headers,
    )
    doc_id = v1_resp.json()["id"]

    v2_resp = await client.post(
        f"/api/v1/documents/{doc_id}/versions",
        files=_make_file(b"v2"),
        headers=headers,
    )
    v2_id = v2_resp.json()["id"]

    # List versions of v1 (the root)
    resp = await client.get(f"/api/v1/documents/{doc_id}/versions", headers=headers)
    assert resp.status_code == 200
    ids = [d["id"] for d in resp.json()]
    assert doc_id in ids
    assert v2_id in ids
    assert len(ids) == 2

    # List versions starting from v2 should also return the full chain
    resp2 = await client.get(f"/api/v1/documents/{v2_id}/versions", headers=headers)
    assert resp2.status_code == 200
    ids2 = [d["id"] for d in resp2.json()]
    assert set(ids2) == {doc_id, v2_id}


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_soft_delete_document(client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(),
        data={"category": "other"},
        headers=headers,
    )
    doc_id = resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
    assert del_resp.status_code == 204

    # Metadata endpoint should 404 after delete
    resp = await client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cannot_access_other_users_document(client: AsyncClient) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "other@example.com")

    project_id = await _create_project(client, h1)
    resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=_make_file(),
        data={"category": "contract"},
        headers=h1,
    )
    doc_id = resp.json()["id"]

    assert (await client.get(f"/api/v1/documents/{doc_id}", headers=h2)).status_code == 404
    assert (
        await client.get(f"/api/v1/documents/{doc_id}/download", headers=h2)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/documents/{doc_id}", headers=h2)
    ).status_code == 404
