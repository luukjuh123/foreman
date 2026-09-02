"""Pydantic schemas for recognition feedback loop."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CorrectionCreate(BaseModel):
    correct_process_id: uuid.UUID
    correct_completion_pct: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = None


class CorrectionResponse(BaseModel):
    id: uuid.UUID
    photo_id: uuid.UUID
    correct_process_id: uuid.UUID
    correct_completion_pct: int | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConfusedPair(BaseModel):
    """AI predicted ai_slug but user corrected to correct_slug."""

    ai_slug: str | None
    correct_slug: str
    count: int


class RecognitionMetricsResponse(BaseModel):
    """Accuracy metrics over all photos visible to the authenticated user."""

    total_predictions: int
    total_corrections: int
    accuracy_pct: float | None
    """Percentage of predictions that were NOT corrected. None when 0 predictions."""
    confused_pairs: list[ConfusedPair]


class TrainingSample(BaseModel):
    photo_id: uuid.UUID
    image_url: str
    ai_process_slug: str | None
    correct_process_slug: str
    correct_completion_pct: int | None
    corrected_at: datetime


class TrainingDataResponse(BaseModel):
    data: list[TrainingSample]
    total: int
