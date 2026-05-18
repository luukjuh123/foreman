"""Tests for AI-assisted review reply drafter."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import create_app
from app.models.review import Review
from app.services.reviews.ai_drafter import (
    DraftedReply,
    HeuristicReplyDrafter,
    ReplyDrafter,
    get_reply_drafter,
)

TEST_DB_URL = "sqlite+aiosqlite://"


class FakeDrafter(ReplyDrafter):
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def draft_reply(
        self,
        *,
        author_name: str,
        rating: int,
        comment: str | None,
        company_name: str = "our team",
    ) -> DraftedReply:
        self.calls.append(
            {
                "author_name": author_name,
                "rating": rating,
                "comment": comment,
                "company_name": company_name,
            }
        )
        return DraftedReply(
            reply_text=f"Hi {author_name}, thanks for the {rating}-star review!",
            reasoning=f"Fake drafter, rating={rating}",
        )


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

    fake_drafter = FakeDrafter()
    app = create_app()

    async def override_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_reply_drafter] = lambda: fake_drafter

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post(
            "/api/v1/auth/register",
            json={
                "email": "ai@example.com",
                "name": "AI",
                "password": "secretpass123",
            },
        )
        token = resp.json()["access_token"]
        ac.headers["Authorization"] = f"Bearer {token}"

        # Seed a review
        async with session_factory() as s:
            r = Review(
                location_id="loc-1",
                external_id="ext-1",
                author_name="Alice Smith",
                rating=2,
                comment="Workers arrived late.",
            )
            s.add(r)
            await s.commit()
            await s.refresh(r)
            review_id = str(r.id)

        yield ac, fake_drafter, review_id
    await engine.dispose()


@pytest.mark.asyncio
async def test_heuristic_drafter_low_rating_is_apologetic() -> None:
    d = HeuristicReplyDrafter()
    out = await d.draft_reply(
        author_name="Alice Smith", rating=1, comment="Bad"
    )
    assert "sorry" in out.reply_text.lower()
    assert out.reasoning  # non-empty


@pytest.mark.asyncio
async def test_heuristic_drafter_high_rating_is_grateful() -> None:
    d = HeuristicReplyDrafter()
    out = await d.draft_reply(
        author_name="Bob Jones", rating=5, comment="Perfect"
    )
    lower = out.reply_text.lower()
    assert "thank" in lower
    assert "sorry" not in lower
    assert "5/5" in out.reasoning or "5)" in out.reasoning


@pytest.mark.asyncio
async def test_draft_reply_endpoint_calls_drafter(setup) -> None:
    client, fake, review_id = setup
    resp = await client.post(f"/api/v1/reviews/{review_id}/draft-reply")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["error"] is None
    data = body["data"]
    assert data["review_id"] == review_id
    assert "Alice Smith" in data["reply_text"]
    assert data["reasoning"]

    # Drafter must have received the persisted review fields
    assert len(fake.calls) == 1
    call = fake.calls[0]
    assert call["author_name"] == "Alice Smith"
    assert call["rating"] == 2
    assert call["comment"] == "Workers arrived late."


@pytest.mark.asyncio
async def test_draft_reply_does_not_send_to_google(setup) -> None:
    """Draft is local-only: it must not write replied_at on the review."""
    client, _, review_id = setup
    await client.post(f"/api/v1/reviews/{review_id}/draft-reply")
    listing = await client.get("/api/v1/reviews", params={"location_id": "loc-1"})
    item = listing.json()["data"][0]
    assert item["reply_text"] is None
    assert item["replied_at"] is None


@pytest.mark.asyncio
async def test_draft_reply_unknown_review_404(setup) -> None:
    client, _, _ = setup
    resp = await client.post(
        "/api/v1/reviews/00000000-0000-0000-0000-000000000000/draft-reply"
    )
    assert resp.status_code == 404


def test_openai_drafter_requires_key() -> None:
    from app.services.reviews.ai_drafter import OpenAIReplyDrafter

    with pytest.raises(ValueError):
        OpenAIReplyDrafter(api_key="", model="gpt-4o-mini")
