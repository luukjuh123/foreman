"""Pydantic schemas for staff assignments."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator


class StaffAssignmentCreate(BaseModel):
    staff_id: uuid.UUID
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    start_at: datetime
    end_at: datetime
    notes: str | None = None

    @model_validator(mode="after")
    def _window_positive(self) -> "StaffAssignmentCreate":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at")
        return self


class StaffAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    staff_id: uuid.UUID
    project_id: uuid.UUID
    task_id: uuid.UUID | None
    start_at: datetime
    end_at: datetime
    notes: str | None
    created_at: datetime
