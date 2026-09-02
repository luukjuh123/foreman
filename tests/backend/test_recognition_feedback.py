"""Tests for the recognition feedback loop.

Covers:
- POST /api/v1/photos/{photo_id}/corrections  — store user correction
- GET  /api/v1/recognition/metrics            — accuracy over time
- GET  /api/v1/recognition/training-data      — export corrected samples
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.recognition.photo_client import (
    FakePhotoRecognitionClient,
    RecognitionResult,
    get_default_client,
)


# ---------------------------------------------------------------------------
# Fixtures (self-contained in-memory DB per test module)
# ---------------------------------------------------------------------------

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
    app.dependency_overrides[get_default_client] = lambda: FakePhotoRecognitionClient(
        process_slug="stucen", completion_pct=50, reasoning="Fake."
    )
    yield app
    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_with_db):
    async with AsyncClient(
        transport=ASGITransport(app=app_with_db), base_url="http://test"
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _auth(client: AsyncClient, email: str = "u@example.com") -> dict:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "U", "password": "secret123"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _make_project(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/projects/", json={"name": "P"}, headers=headers)
    return r.json()["id"]


async def _make_process(client: AsyncClient, headers: dict, slug: str) -> str:
    r = await client.post(
        "/api/v1/processes/",
        json={"slug": slug, "name": slug.capitalize()},
        headers=headers,
    )
    return r.json()["id"]


async def _upload_photo(
    client: AsyncClient,
    headers: dict,
    project_id: str,
    url: str = "https://cdn.example/img.jpg",
) -> str:
    r = await client.post(
        f"/api/v1/photos/projects/{project_id}",
        json={"image_url": url},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# POST /api/v1/photos/{photo_id}/corrections
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_correction_stores_record(app_with_db, client: AsyncClient) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    correct_process_id = await _make_process(client, headers, "tegelen")
    photo_id = await _upload_photo(client, headers, project_id)

    r = await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={
            "correct_process_id": correct_process_id,
            "correct_completion_pct": 80,
            "notes": "Actually tiling, not plastering.",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["photo_id"] == photo_id
    assert body["correct_process_id"] == correct_process_id
    assert body["correct_completion_pct"] == 80
    assert body["notes"] == "Actually tiling, not plastering."
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_create_correction_without_completion_pct(app_with_db, client: AsyncClient) -> None:
    """correct_completion_pct is optional."""
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    correct_process_id = await _make_process(client, headers, "metselen")
    photo_id = await _upload_photo(client, headers, project_id)

    r = await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={"correct_process_id": correct_process_id},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["correct_completion_pct"] is None


@pytest.mark.asyncio
async def test_create_correction_without_notes(app_with_db, client: AsyncClient) -> None:
    """notes is optional."""
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    correct_process_id = await _make_process(client, headers, "schilderen")
    photo_id = await _upload_photo(client, headers, project_id)

    r = await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={"correct_process_id": correct_process_id, "correct_completion_pct": 30},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["notes"] is None


@pytest.mark.asyncio
async def test_correction_on_nonexistent_photo_returns_404(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    await _make_process(client, headers, "stucen")
    fake_id = "00000000-0000-0000-0000-000000000001"
    process_id = await _make_process(client, headers, "tegelen")

    r = await client.post(
        f"/api/v1/photos/{fake_id}/corrections",
        json={"correct_process_id": process_id},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_correction_on_other_users_photo_returns_403(
    app_with_db, client: AsyncClient
) -> None:
    h1 = await _auth(client, "owner@example.com")
    h2 = await _auth(client, "intruder@example.com")
    project_id = await _make_project(client, h1)
    await _make_process(client, h1, "stucen")
    process_id = await _make_process(client, h1, "tegelen")
    photo_id = await _upload_photo(client, h1, project_id)

    r = await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={"correct_process_id": process_id},
        headers=h2,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_correction_requires_auth(app_with_db, client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/photos/00000000-0000-0000-0000-000000000001/corrections",
        json={"correct_process_id": "00000000-0000-0000-0000-000000000002"},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_correction_with_invalid_process_id_returns_422(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    photo_id = await _upload_photo(client, headers, project_id)

    r = await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={"correct_process_id": "not-a-uuid"},
        headers=headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_correction_completion_pct_out_of_range_returns_422(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    process_id = await _make_process(client, headers, "tegelen")
    photo_id = await _upload_photo(client, headers, project_id)

    r = await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={"correct_process_id": process_id, "correct_completion_pct": 150},
        headers=headers,
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/recognition/metrics
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_metrics_empty_when_no_corrections(app_with_db, client: AsyncClient) -> None:
    headers = await _auth(client)
    r = await client.get("/api/v1/recognition/metrics", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_predictions"] == 0
    assert body["total_corrections"] == 0
    assert body["accuracy_pct"] is None
    assert isinstance(body["confused_pairs"], list)


@pytest.mark.asyncio
async def test_metrics_accuracy_calculation(app_with_db, client: AsyncClient) -> None:
    """Submit 3 photos (AI predicted stucen for all), correct 2 of them to tegelen.
    Accuracy = 1/3 predictions that were NOT corrected = 33%.
    """
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    tegelen_id = await _make_process(client, headers, "tegelen")

    photo_ids = []
    for i in range(3):
        pid = await _upload_photo(client, headers, project_id, f"https://cdn/{i}.jpg")
        photo_ids.append(pid)

    # Correct 2 photos
    for pid in photo_ids[:2]:
        r = await client.post(
            f"/api/v1/photos/{pid}/corrections",
            json={"correct_process_id": tegelen_id, "correct_completion_pct": 70},
            headers=headers,
        )
        assert r.status_code == 201

    r = await client.get("/api/v1/recognition/metrics", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_predictions"] == 3
    assert body["total_corrections"] == 2
    # accuracy = (3 - 2) / 3 * 100 = 33
    assert body["accuracy_pct"] == pytest.approx(33.33, abs=0.1)


@pytest.mark.asyncio
async def test_metrics_confused_pairs(app_with_db, client: AsyncClient) -> None:
    """Confused pairs lists (ai_slug, correct_slug) combinations that were corrected."""
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")  # AI always predicts this
    tegelen_id = await _make_process(client, headers, "tegelen")

    # Two corrections: stucen → tegelen
    for i in range(2):
        pid = await _upload_photo(client, headers, project_id, f"https://cdn/{i}.jpg")
        await client.post(
            f"/api/v1/photos/{pid}/corrections",
            json={"correct_process_id": tegelen_id},
            headers=headers,
        )

    r = await client.get("/api/v1/recognition/metrics", headers=headers)
    assert r.status_code == 200
    pairs = r.json()["confused_pairs"]
    assert len(pairs) >= 1
    pair = pairs[0]
    assert pair["ai_slug"] == "stucen"
    assert pair["correct_slug"] == "tegelen"
    assert pair["count"] == 2


@pytest.mark.asyncio
async def test_metrics_requires_auth(app_with_db, client: AsyncClient) -> None:
    r = await client.get("/api/v1/recognition/metrics")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/v1/recognition/training-data
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_training_data_empty_without_corrections(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    r = await client.get("/api/v1/recognition/training-data", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_training_data_contains_corrected_samples(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    tegelen_id = await _make_process(client, headers, "tegelen")
    photo_id = await _upload_photo(client, headers, project_id)

    await client.post(
        f"/api/v1/photos/{photo_id}/corrections",
        json={"correct_process_id": tegelen_id, "correct_completion_pct": 55},
        headers=headers,
    )

    r = await client.get("/api/v1/recognition/training-data", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    sample = body["data"][0]
    assert sample["image_url"] == "https://cdn.example/img.jpg"
    assert sample["ai_process_slug"] == "stucen"
    assert sample["correct_process_slug"] == "tegelen"
    assert sample["correct_completion_pct"] == 55
    assert "photo_id" in sample
    assert "corrected_at" in sample


@pytest.mark.asyncio
async def test_training_data_does_not_include_uncorrected_photos(
    app_with_db, client: AsyncClient
) -> None:
    headers = await _auth(client)
    project_id = await _make_project(client, headers)
    await _make_process(client, headers, "stucen")
    # Upload photo but do NOT correct it
    await _upload_photo(client, headers, project_id)

    r = await client.get("/api/v1/recognition/training-data", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_training_data_requires_auth(app_with_db, client: AsyncClient) -> None:
    r = await client.get("/api/v1/recognition/training-data")
    assert r.status_code in (401, 403)
