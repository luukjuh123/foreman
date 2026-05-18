"""Tests for photo recognition service + upload endpoints."""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.recognition.photo_client import (
    FakePhotoRecognitionClient,
    PhotoRecognitionClient,
    RecognitionResult,
    get_default_client,
)


# ---------------------------------------------------------------------------
# Unit tests for the recognition client interface
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fake_client_returns_configured_result() -> None:
    client = FakePhotoRecognitionClient(
        process_slug="tegelen", completion_pct=75, reasoning="Saw tiles."
    )
    result = await client.analyze("http://x/y.jpg")
    assert result.process_slug == "tegelen"
    assert result.completion_pct == 75
    assert result.reasoning == "Saw tiles."
    assert result.raw["provider"] == "fake"
    assert result.raw["image_url"] == "http://x/y.jpg"


@pytest.mark.asyncio
async def test_fake_client_can_return_unknown() -> None:
    client = FakePhotoRecognitionClient(
        process_slug=None, completion_pct=None, reasoning="Could not identify."
    )
    result = await client.analyze("http://x/y.jpg")
    assert result.process_slug is None
    assert result.completion_pct is None


def test_fake_client_satisfies_protocol() -> None:
    client: PhotoRecognitionClient = FakePhotoRecognitionClient()
    assert isinstance(client, PhotoRecognitionClient)


def test_openai_client_does_not_init_without_key(monkeypatch) -> None:
    """OpenAI client must be lazy: no error at construction without a key."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from app.services.recognition.photo_client import OpenAIPhotoRecognitionClient

    c = OpenAIPhotoRecognitionClient(api_key=None)
    assert c is not None  # construction succeeds


def test_get_default_client_returns_fake_without_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    c = get_default_client()
    assert isinstance(c, FakePhotoRecognitionClient)


def test_get_default_client_returns_openai_with_key(monkeypatch) -> None:
    from app.services.recognition.photo_client import OpenAIPhotoRecognitionClient

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    c = get_default_client()
    assert isinstance(c, OpenAIPhotoRecognitionClient)


# ---------------------------------------------------------------------------
# Integration tests for the upload endpoint
# ---------------------------------------------------------------------------

class _StubClient:
    """Test-controlled recognition client."""

    def __init__(self, result: RecognitionResult) -> None:
        self._result = result
        self.calls: list[str] = []

    async def analyze(self, image_url: str) -> RecognitionResult:
        self.calls.append(image_url)
        return self._result


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
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


async def _make_process(client: AsyncClient, headers: dict, slug: str = "stucen") -> str:
    r = await client.post(
        "/api/v1/processes/", json={"slug": slug, "name": slug.capitalize()}, headers=headers
    )
    return r.json()["id"]


@pytest.mark.asyncio
async def test_upload_photo_recognizes_known_process(app_with_db, client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    process_id = await _make_process(client, headers, "stucen")

    stub = _StubClient(RecognitionResult(
        process_slug="stucen",
        completion_pct=60,
        reasoning="Walls covered with fresh plaster.",
        raw={"provider": "stub"},
    ))
    app_with_db.dependency_overrides[get_default_client] = lambda: stub

    r = await client.post(
        f"/api/v1/photos/projects/{project_id}",
        json={"image_url": "https://cdn.example/img1.jpg"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["recognized_process_id"] == process_id
    assert body["recognized_process_slug"] == "stucen"
    assert body["completion_pct"] == 60
    assert body["reasoning"] == "Walls covered with fresh plaster."
    assert body["image_url"] == "https://cdn.example/img1.jpg"
    assert stub.calls == ["https://cdn.example/img1.jpg"]


@pytest.mark.asyncio
async def test_upload_photo_unknown_slug_leaves_process_null(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)

    stub = _StubClient(RecognitionResult(
        process_slug="something-unknown",
        completion_pct=None,
        reasoning="Cannot match a known process slug.",
        raw={},
    ))
    app_with_db.dependency_overrides[get_default_client] = lambda: stub

    r = await client.post(
        f"/api/v1/photos/projects/{project_id}",
        json={"image_url": "https://cdn.example/img2.jpg"},
        headers=headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["recognized_process_id"] is None
    assert body["recognized_process_slug"] is None


@pytest.mark.asyncio
async def test_upload_photo_no_slug_returned(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    stub = _StubClient(RecognitionResult(
        process_slug=None, completion_pct=None, reasoning="Blurry.", raw={}
    ))
    app_with_db.dependency_overrides[get_default_client] = lambda: stub

    r = await client.post(
        f"/api/v1/photos/projects/{project_id}",
        json={"image_url": "https://cdn.example/blurry.jpg"},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["recognized_process_id"] is None
    assert r.json()["reasoning"] == "Blurry."


@pytest.mark.asyncio
async def test_upload_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/photos/projects/00000000-0000-0000-0000-000000000000",
        json={"image_url": "https://x"},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_upload_to_other_users_project_forbidden(
    app_with_db, client: AsyncClient
) -> None:
    h1 = await _auth(client, "owner@example.com")
    project_id = await _make_project(client, h1)
    h2 = await _auth(client, "intruder@example.com")

    app_with_db.dependency_overrides[get_default_client] = lambda: FakePhotoRecognitionClient()
    r = await client.post(
        f"/api/v1/photos/projects/{project_id}",
        json={"image_url": "https://x"},
        headers=h2,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_photos(app_with_db, client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")

    app_with_db.dependency_overrides[get_default_client] = lambda: FakePhotoRecognitionClient(
        process_slug="stucen", completion_pct=40, reasoning="Fake."
    )
    for i in range(3):
        await client.post(
            f"/api/v1/photos/projects/{project_id}",
            json={"image_url": f"https://cdn.example/{i}.jpg"},
            headers=headers,
        )
    r = await client.get(f"/api/v1/photos/projects/{project_id}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 3
    assert all(p["recognized_process_slug"] == "stucen" for p in body["data"])
