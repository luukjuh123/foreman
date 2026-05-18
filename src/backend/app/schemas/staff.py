"""Pydantic schemas for Staff and StaffAvailability."""

import uuid
from datetime import datetime, time

from pydantic import BaseModel, Field, model_validator


class StaffAvailabilityCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _check_order(self) -> "StaffAvailabilityCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class StaffAvailabilityResponse(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    day_of_week: int
    start_time: time
    end_time: time
    created_at: datetime

    model_config = {"from_attributes": True}


class StaffCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    role: str = Field(min_length=1, max_length=100)
    hourly_rate_cents: int = Field(ge=0)
    email: str | None = None
    phone: str | None = None
    weekly_hours_target: float = Field(default=40.0, ge=0)
    active: bool = True


class StaffUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    hourly_rate_cents: int | None = Field(default=None, ge=0)
    email: str | None = None
    phone: str | None = None
    weekly_hours_target: float | None = Field(default=None, ge=0)
    active: bool | None = None


class StaffResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    full_name: str
    role: str
    email: str | None
    phone: str | None
    hourly_rate_cents: int
    weekly_hours_target: float
    active: bool
    created_at: datetime
    updated_at: datetime
    availability: list[StaffAvailabilityResponse] = []

    model_config = {"from_attributes": True}


class StaffListResponse(BaseModel):
    data: list[StaffResponse]
    total: int
    page: int
    per_page: int
