"""Pydantic schemas for Staff, StaffAvailability, and StaffCertification."""

import uuid
from datetime import date, datetime, time
from typing import Literal

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


class StaffUtilizationResponse(BaseModel):
    utilization_percent: float
    assigned_hours: float
    available_hours: float


# Certification type as a discriminated literal for validation
CertType = Literal["VCA", "BHV", "crane_license", "asbestos", "other"]


class CertificationCreate(BaseModel):
    cert_type: CertType
    cert_name: str = Field(min_length=1, max_length=255)
    issued_at: date
    expires_at: date
    document_path: str | None = None

    @model_validator(mode="after")
    def _check_dates(self) -> "CertificationCreate":
        if self.expires_at <= self.issued_at:
            raise ValueError("expires_at must be after issued_at")
        return self


class CertificationUpdate(BaseModel):
    cert_type: CertType | None = None
    cert_name: str | None = Field(default=None, min_length=1, max_length=255)
    issued_at: date | None = None
    expires_at: date | None = None
    document_path: str | None = None


class CertificationResponse(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    cert_type: str
    cert_name: str
    issued_at: date
    expires_at: date
    document_path: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ComplianceOverviewResponse(BaseModel):
    total_staff: int
    total_certifications: int
    expired_count: int
    expiring_soon_count: int
    valid_count: int
