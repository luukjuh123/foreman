"""Pydantic schemas for time entries and payroll calculations."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class TimeEntryCreate(BaseModel):
    staff_id: uuid.UUID
    work_date: date
    hours: float = Field(gt=0, le=24)
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


class TimeEntryResponse(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    project_id: uuid.UUID | None
    task_id: uuid.UUID | None
    work_date: date
    hours: float
    hourly_rate_cents_snapshot: int
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PayrollProjectBreakdown(BaseModel):
    project_id: uuid.UUID | None
    hours: float
    gross_cents: int


class PayrollSummary(BaseModel):
    staff_id: uuid.UUID
    period_start: date
    period_end: date
    total_hours: float
    gross_cents: int
    by_project: list[PayrollProjectBreakdown]
