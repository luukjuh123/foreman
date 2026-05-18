"""Rating snapshot / trend schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class SnapshotRequest(BaseModel):
    location_id: str


class SnapshotData(BaseModel):
    location_id: str
    snapshot_date: date
    average_rating: float
    review_count: int


class TrendPoint(BaseModel):
    snapshot_date: date
    average_rating: float
    review_count: int
