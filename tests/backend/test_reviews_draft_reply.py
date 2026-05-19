"""Tests for POST /reviews/{review_id}/draft-reply endpoint."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.models.review import Review
from app.models.user import User
from app.core.security import hash_password
from app.main import create_app
from app.routers.auth import get_current_user

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def app_with_db():
    engine = create_async_engine(
        TEST_DB_URL,
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

    # Stub out auth — always returns a fake user
    fake_user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        name="Test User",
        hashed_password=hash_password("password"),
    )

    async def override_get_current_user():
        return fake_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield app, session_factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client_and_db(app_with_db):
    app, session_factory = app_with_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, session_factory


async def _create_review(
    session_factory,
    *,
    rating: int = 5,
    author_name: str = "Jan de Vries",
    comment: str | None = "Geweldig werk!",
    reply_text: str | None = None,
) -> Review:
    review = Review(
        id=uuid.uuid4(),
        location_id="loc-001",
        external_id=f"ext-{uuid.uuid4()}",
        author_name=author_name,
        rating=rating,
        comment=comment,
        created_at_external=None,
        reply_text=reply_text,
        replied_at=None,
    )
    async with session_factory() as session:
        session.add(review)
        await session.commit()
        await session.refresh(review)
    return review


@pytest.mark.asyncio
async def test_draft_reply_high_rating(client_and_db) -> None:
    """Rating >= 4 produces a thankful Dutch reply containing the author name."""
    client, session_factory = client_and_db
    review = await _create_review(
        session_factory, rating=5, author_name="Jan de Vries", comment="Top bedrijf!"
    )

    resp = await client.post(f"/api/v1/reviews/{review.id}/draft-reply")

    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "draft_text" in body["data"]
    draft = body["data"]["draft_text"]
    assert isinstance(draft, str)
    assert len(draft) > 0
    # Must contain the author's first name
    assert "Jan" in draft


@pytest.mark.asyncio
async def test_draft_reply_medium_rating(client_and_db) -> None:
    """Rating == 3 produces a Dutch reply asking how to improve."""
    client, session_factory = client_and_db
    review = await _create_review(
        session_factory, rating=3, author_name="Petra Bakker", comment="Redelijk goed."
    )

    resp = await client.post(f"/api/v1/reviews/{review.id}/draft-reply")

    assert resp.status_code == 200
    draft = resp.json()["data"]["draft_text"]
    assert "Petra" in draft


@pytest.mark.asyncio
async def test_draft_reply_low_rating(client_and_db) -> None:
    """Rating <= 2 produces an apologetic Dutch reply."""
    client, session_factory = client_and_db
    review = await _create_review(
        session_factory, rating=1, author_name="Kees Smit", comment="Teleurstellend."
    )

    resp = await client.post(f"/api/v1/reviews/{review.id}/draft-reply")

    assert resp.status_code == 200
    draft = resp.json()["data"]["draft_text"]
    assert "Kees" in draft


@pytest.mark.asyncio
async def test_draft_reply_no_comment(client_and_db) -> None:
    """Works even when the review has no comment text."""
    client, session_factory = client_and_db
    review = await _create_review(
        session_factory, rating=4, author_name="Maria Jansen", comment=None
    )

    resp = await client.post(f"/api/v1/reviews/{review.id}/draft-reply")

    assert resp.status_code == 200
    assert "draft_text" in resp.json()["data"]


@pytest.mark.asyncio
async def test_draft_reply_not_found(client_and_db) -> None:
    """Returns 404 for an unknown review id."""
    client, _ = client_and_db
    unknown_id = uuid.uuid4()

    resp = await client.post(f"/api/v1/reviews/{unknown_id}/draft-reply")

    assert resp.status_code == 404
