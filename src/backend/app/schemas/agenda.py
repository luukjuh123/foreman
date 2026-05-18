"""Pydantic schemas for agenda views."""

import uuid
from datetime import date

from pydantic import BaseModel


class AgendaTask(BaseModel):
    """A scheduled task as it appears in the agenda."""

    task_id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    phase_id: uuid.UUID
    phase_name: str
    name: str
    description: str | None = None
    status: str
    priority: int
    estimated_hours: float
    start_date: date | None = None
    end_date: date | None = None
    # Optional time-of-day hints (not yet stored on Task — reserved for future)
    start_time: str | None = None
    end_time: str | None = None
    # Optional location (not yet stored on Task — reserved for future)
    location: str | None = None


class AgendaDay(BaseModel):
    """All tasks scheduled to occur on a given calendar day."""

    date: date
    tasks: list[AgendaTask]


class AgendaWeekResponse(BaseModel):
    """Weekly agenda — seven consecutive days starting on `week_start`."""

    week_start: date
    week_end: date
    days: list[AgendaDay]


class AgendaDayResponse(BaseModel):
    """Single-day agenda view."""

    date: date
    tasks: list[AgendaTask]
