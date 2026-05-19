"""Tests for Google Business Profile integration.

Uses FakeGoogleBusinessClient injected via FastAPI dependency override so no
real HTTP calls are made.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.services.reviews.google_client import (
    GoogleBusinessClient,
    GoogleReview,
    get_google_business_client,
)

TEST_DB_URL = "sqlite+aiosqlite://"


class FakeGoogleBusinessClient(GoogleBusinessClient):
    def __init__(self) -> None:
        self.reviews: dict[str, list[GoogleReview]] = {}
        self.replies: list[tuple[str, str, str]] = []

    async def list_reviews(self, location_id: str) -> list[GoogleReview]:
        return list(self.reviews.get(location_id, []))

    async def reply_to_review(self, location_id, review_id, text) -> None:
        self.replies.append((location_id, review_id, text))


@pytest_asyncio.fixture
async def setup():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    fake_client = FakeGoogleBusinessClient()
    app = create_app()

    async def override_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_google_business_client] = lambda: fake_client

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "rev@example.com",
                "name": "Reviewer",
                "password": "secretpass123",
            },
        )
        assert resp.status_code == 201
        token = resp.json()["access_token"]
        ac.headers["Authorization"] = f"Bearer {token}"
        yield ac, fake_client
    await engine.dispose()


def test_google_client_interface_methods_exist() -> None:
    assert hasattr(GoogleBusinessClient, "list_reviews")
    assert hasattr(GoogleBusinessClient, "reply_to_review")


@pytest.mark.asyncio
async def test_sync_fetches_and_persists_reviews(setup) -> None:
    client, fake = setup
    fake.reviews["loc-1"] = [
        GoogleReview("gid-1", "Alice", 5, "Great work", "2026-01-01T10:00:00Z"),
        GoogleReview("gid-2", "Bob", 3, "OK", "2026-01-02T10:00:00Z"),
    ]
    resp = await client.post("/api/v1/reviews/sync", json={"location_id": "loc-1"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["error"] is None
    assert body["data"]["synced_count"] == 2

    listing = await client.get("/api/v1/reviews", params={"location_id": "loc-1"})
    assert listing.status_code == 200
    data = listing.json()["data"]
    assert len(data) == 2
    assert sorted(r["rating"] for r in data) == [3, 5]


@pytest.mark.asyncio
async def test_sync_is_idempotent_on_external_id(setup) -> None:
    client, fake = setup
    fake.reviews["loc-1"] = [GoogleReview("gid-1", "Alice", 5, "Great", "2026-01-01T10:00:00Z")]
    await client.post("/api/v1/reviews/sync", json={"location_id": "loc-1"})
    fake.reviews["loc-1"] = [GoogleReview("gid-1", "Alice", 4, "Edit", "2026-01-01T10:00:00Z")]
    await client.post("/api/v1/reviews/sync", json={"location_id": "loc-1"})

    listing = await client.get("/api/v1/reviews", params={"location_id": "loc-1"})
    data = listing.json()["data"]
    assert len(data) == 1
    assert data[0]["rating"] == 4
    assert data[0]["comment"] == "Edit"


@pytest.mark.asyncio
async def test_reply_sent_to_client_and_persisted(setup) -> None:
    client, fake = setup
    fake.reviews["loc-1"] = [GoogleReview("gid-7", "Carol", 2, "Slow", "2026-01-03T10:00:00Z")]
    await client.post("/api/v1/reviews/sync", json={"location_id": "loc-1"})
    listing = await client.get("/api/v1/reviews", params={"location_id": "loc-1"})
    review_id = listing.json()["data"][0]["id"]

    resp = await client.post(
        f"/api/v1/reviews/{review_id}/reply",
        json={"text": "Sorry to hear that — we will improve."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["error"] is None
    assert fake.replies == [("loc-1", "gid-7", "Sorry to hear that — we will improve.")]

    listing2 = await client.get("/api/v1/reviews", params={"location_id": "loc-1"})
    item = listing2.json()["data"][0]
    assert item["reply_text"] == "Sorry to hear that — we will improve."
    assert item["replied_at"] is not None


@pytest.mark.asyncio
async def test_reply_unknown_review_404(setup) -> None:
    client, _ = setup
    resp = await client.post(
        "/api/v1/reviews/00000000-0000-0000-0000-000000000000/reply",
        json={"text": "hi"},
    )
    assert resp.status_code == 404


def test_live_client_requires_token() -> None:
    from app.services.reviews.google_client import LiveGoogleBusinessClient

    with pytest.raises(ValueError):
        LiveGoogleBusinessClient(access_token="")
