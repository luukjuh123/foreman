"""Pydantic schemas for ProcessTimeEntry."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class TimeEntryStartRequest(BaseModel):
    notes: str | None = None


class TimeEntryStopRequest(BaseModel):
    notes: str | None = None


class TimeEntryResponse(BaseModel):
    id: uuid.UUID
    project_process_id: uuid.UUID
    started_at: datetime
    stopped_at: datetime | None
    duration_seconds: int | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TimeEntryListResponse(BaseModel):
    data: list[TimeEntryResponse]
    total_seconds: int  # sum of duration_seconds for completed entries
