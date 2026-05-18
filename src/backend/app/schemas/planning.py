"""Pydantic schemas for AI planning autofill request/response."""

import uuid
from datetime import date

from pydantic import BaseModel


class AutofillRequest(BaseModel):
    project_id: uuid.UUID
    start_date: date | None = None
    working_hours_per_day: int = 8


class TaskScheduleProposal(BaseModel):
    task_id: uuid.UUID | str
    proposed_start_date: date
    proposed_end_date: date
    reasoning: str
    is_critical: bool


class AutofillResponse(BaseModel):
    proposals: list[TaskScheduleProposal]


class ApplyScheduleRequest(BaseModel):
    project_id: uuid.UUID
    task_ids: list[uuid.UUID]
    start_date: date | None = None
    working_hours_per_day: int = 8


class ApplyScheduleResponse(BaseModel):
    updated_count: int
