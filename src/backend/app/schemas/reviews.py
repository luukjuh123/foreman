"""Review request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SyncReviewsRequest(BaseModel):
    location_id: str


class SyncReviewsData(BaseModel):
    location_id: str
    synced_count: int


class ReplyRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ReviewResponse(BaseModel):
    id: uuid.UUID
    location_id: str
    external_id: str
    author_name: str
    rating: int
    comment: str | None
    created_at_external: str | None
    reply_text: str | None
    replied_at: datetime | None

    model_config = {"from_attributes": True}


class Envelope(BaseModel):
    """Standard response envelope: {data, error}."""

    data: Any | None = None
    error: Any | None = None


class DraftReplyResponse(BaseModel):
    review_id: uuid.UUID
    reply_text: str
    reasoning: str
