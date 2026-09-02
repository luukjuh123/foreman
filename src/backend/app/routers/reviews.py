"""Reviews router — sync, list, stats, draft reply, and post reply to Google Business reviews."""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.review import Review
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.reviews import (
    DraftReplyResponse,
    Envelope,
    MonthlyTrend,
    ReplyRequest,
    ReviewResponse,
    ReviewStats,
    SyncReviewsData,
    SyncReviewsRequest,
)
from app.services.reviews.ai_responder import draft_reply as ai_draft_reply
from app.services.reviews.google_client import (
    GoogleBusinessClient,
    get_google_business_client,
)
from app.routers.deps import get_or_404
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("/sync", response_model=Envelope)
async def sync_reviews(
    body: SyncReviewsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    google: GoogleBusinessClient = Depends(get_google_business_client),
) -> Envelope:
    """Fetch reviews from Google for `location_id` and upsert by external_id."""
    fetched = await google.list_reviews(body.location_id)
    # Prefetch all existing reviews in one query instead of N queries
    existing_rows = (await db.execute(
        select(Review).where(Review.location_id == body.location_id,
                             Review.external_id.in_([g.external_id for g in fetched]))
    )).scalars().all()
    existing_map = {r.external_id: r for r in existing_rows}

    _SYNC_FIELDS = ("author_name", "rating", "comment", "created_at_external")
    for g in fetched:
        r = existing_map.get(g.external_id) or Review(location_id=body.location_id, external_id=g.external_id)
        for f in _SYNC_FIELDS:
            setattr(r, f, getattr(g, f))
        db.add(r)
    await db.commit()
    return Envelope(data=SyncReviewsData(location_id=body.location_id, synced_count=len(fetched)).model_dump())


@router.get("", response_model=Envelope)
async def list_reviews(
    location_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope:
    """List stored reviews for a location, newest external first."""
    result = await db.execute(
        select(Review).where(Review.location_id == location_id).order_by(Review.created_at_external.desc().nullslast())
    )
    rows = result.scalars().all()
    items = [ReviewResponse.model_validate(r).model_dump(mode="json") for r in rows]
    return Envelope(data=items)


@router.get("/stats", response_model=Envelope)
async def get_review_stats(
    location_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope:
    """Aggregate rating stats for a location."""
    result = await db.execute(select(Review).where(Review.location_id == location_id))
    rows = result.scalars().all()

    total_count = len(rows)
    if total_count == 0:
        return Envelope(data=ReviewStats(average_rating=0.0, total_count=0,
                                         rating_distribution={"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
                                         monthly_trend=[]).model_dump())

    dist = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0} | {str(k): v for k, v in Counter(r.rating for r in rows).items()}
    monthly: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        month = r.created_at_external[:7] if r.created_at_external and len(r.created_at_external) >= 7 else "unknown"
        monthly[month].append(r.rating)

    stats = ReviewStats(
        average_rating=round(sum(r.rating for r in rows) / total_count, 2),
        total_count=total_count,
        rating_distribution=dist,
        monthly_trend=[MonthlyTrend(month=m, average_rating=round(sum(rs) / len(rs), 2), count=len(rs))
                       for m, rs in sorted(monthly.items()) if m != "unknown"],
    )
    return Envelope(data=stats.model_dump())


@router.post("/{review_id}/draft-reply", response_model=Envelope)
async def draft_reply_for_review(
    review_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope:
    """Generate a professional Dutch reply draft for a review."""
    review = await get_or_404(db, Review, Review.id == review_id)
    draft_text = await ai_draft_reply(
        author_name=review.author_name,
        rating=review.rating,
        comment=review.comment,
    )
    return Envelope(data=DraftReplyResponse(draft_text=draft_text).model_dump())


@router.post("/{review_id}/reply", response_model=Envelope)
async def reply_to_review(
    review_id: uuid.UUID,
    body: ReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    google: GoogleBusinessClient = Depends(get_google_business_client),
) -> Envelope:
    """Send a reply via the Google client and persist it locally."""
    review = await get_or_404(db, Review, Review.id == review_id)
    await google.reply_to_review(review.location_id, review.external_id, body.text)
    review.reply_text = body.text
    review.replied_at = datetime.now(UTC)
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return Envelope(data=ReviewResponse.model_validate(review).model_dump(mode="json"))
