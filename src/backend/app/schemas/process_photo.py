"""Pydantic schemas for ProcessPhoto."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PhotoUploadRequest(BaseModel):
    image_url: str = Field(min_length=1, max_length=1024)


class PhotoResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    recognized_process_id: uuid.UUID | None
    recognized_process_slug: str | None
    image_url: str
    completion_pct: int | None
    reasoning: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PhotoListResponse(BaseModel):
    data: list[PhotoResponse]
