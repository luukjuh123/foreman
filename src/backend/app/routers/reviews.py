"""Reviews router — sync, list and reply to Google Business reviews."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.review import Review
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.reviews import (
    Envelope,
    ReplyRequest,
    ReviewResponse,
    SyncReviewsData,
    SyncReviewsRequest,
)
from app.services.reviews.google_client import (
    GoogleBusinessClient,
    get_google_business_client,
)

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
    synced = 0
    for g in fetched:
        result = await db.execute(
            select(Review).where(
                Review.location_id == body.location_id,
                Review.external_id == g.external_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(
                Review(
                    location_id=body.location_id,
                    external_id=g.external_id,
                    author_name=g.author_name,
                    rating=g.rating,
                    comment=g.comment,
                    created_at_external=g.created_at_external,
                )
            )
        else:
            existing.author_name = g.author_name
            existing.rating = g.rating
            existing.comment = g.comment
            existing.created_at_external = g.created_at_external
            db.add(existing)
        synced += 1
    await db.commit()
    return Envelope(
        data=SyncReviewsData(
            location_id=body.location_id, synced_count=synced
        ).model_dump()
    )


@router.get("", response_model=Envelope)
async def list_reviews(
    location_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope:
    """List stored reviews for a location, newest external first."""
    result = await db.execute(
        select(Review)
        .where(Review.location_id == location_id)
        .order_by(Review.created_at_external.desc().nullslast())
    )
    rows = result.scalars().all()
    items = [ReviewResponse.model_validate(r).model_dump(mode="json") for r in rows]
    return Envelope(data=items)


@router.post("/{review_id}/reply", response_model=Envelope)
async def reply_to_review(
    review_id: uuid.UUID,
    body: ReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    google: GoogleBusinessClient = Depends(get_google_business_client),
) -> Envelope:
    """Send a reply via the Google client and persist it locally."""
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )
    await google.reply_to_review(review.location_id, review.external_id, body.text)
    review.reply_text = body.text
    review.replied_at = datetime.now(timezone.utc)
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return Envelope(
        data=ReviewResponse.model_validate(review).model_dump(mode="json")
    )
