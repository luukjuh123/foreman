"""Pydantic schemas for Subcontractor management — Phase 19."""

import json
import uuid
from datetime import date, datetime

from typing import Generic, TypeVar

from pydantic import BaseModel, Field, field_validator

T = TypeVar("T")


class PagedResponse(BaseModel, Generic[T]):
    data: list[T]
    total: int
    page: int
    per_page: int

CERT_TYPES = ("VCA", "BRL")
ASSIGNMENT_STATUSES = ("planned", "active", "completed", "cancelled")


# ─── Certification ────────────────────────────────────────────────────────────


class CertificationCreate(BaseModel):
    cert_type: str
    expiry_date: date | None = None

    @field_validator("cert_type")
    @classmethod
    def _valid_cert_type(cls, v: str) -> str:
        if v not in CERT_TYPES:
            raise ValueError(f"cert_type must be one of {CERT_TYPES}")
        return v


class CertificationResponse(BaseModel):
    id: uuid.UUID
    subcontractor_id: uuid.UUID
    cert_type: str
    expiry_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Subcontractor ────────────────────────────────────────────────────────────


class SubcontractorCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    kvk_number: str | None = Field(default=None, max_length=20)
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    specialties: list[str] = Field(default_factory=list)
    hourly_rate_cents: int = Field(ge=0)
    fixed_rate_cents: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None
    active: bool = True


class SubcontractorUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    kvk_number: str | None = Field(default=None, max_length=20)
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    specialties: list[str] | None = None
    hourly_rate_cents: int | None = Field(default=None, ge=0)
    fixed_rate_cents: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None
    active: bool | None = None


class SubcontractorResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    company_name: str
    kvk_number: str | None
    contact_name: str | None
    email: str | None
    phone: str | None
    specialties: list[str]
    hourly_rate_cents: int
    fixed_rate_cents: int | None
    rating: int | None
    notes: str | None
    active: bool
    certifications: list[CertificationResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, *args: object, **kwargs: object):  # type: ignore[override]
        if hasattr(obj, "specialties_json"):
            fields = {f: getattr(obj, f) for f in cls.model_fields if f not in ("specialties", "certifications")}
            fields["specialties"] = json.loads(obj.specialties_json or "[]")
            fields["certifications"] = list(obj.certifications) if hasattr(obj, "certifications") else []
            return cls(**fields)
        return super().model_validate(obj, *args, **kwargs)


SubcontractorListResponse = PagedResponse[SubcontractorResponse]


# ─── SubcontractorAssignment ──────────────────────────────────────────────────


class AssignmentCreate(BaseModel):
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    phase_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=500)
    estimated_hours: float = Field(default=0.0, ge=0)
    agreed_rate_cents: int = Field(default=0, ge=0)
    agreed_fixed_cost_cents: int | None = Field(default=None, ge=0)
    notes: str | None = None


class AssignmentUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=500)
    status: str | None = None
    estimated_hours: float | None = Field(default=None, ge=0)
    actual_hours: float | None = Field(default=None, ge=0)
    agreed_rate_cents: int | None = Field(default=None, ge=0)
    agreed_fixed_cost_cents: int | None = Field(default=None, ge=0)
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ASSIGNMENT_STATUSES:
            raise ValueError(f"status must be one of {ASSIGNMENT_STATUSES}")
        return v


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    phase_id: uuid.UUID | None
    task_id: uuid.UUID | None
    description: str
    status: str
    estimated_hours: float
    actual_hours: float
    agreed_rate_cents: int
    agreed_fixed_cost_cents: int | None
    total_cost_cents: int
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


AssignmentListResponse = PagedResponse[AssignmentResponse]


# ─── SubcontractorInvoice ─────────────────────────────────────────────────────


class SubcontractorInvoiceCreate(BaseModel):
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    assignment_id: uuid.UUID | None = None
    invoice_reference: str = Field(min_length=1, max_length=100)
    invoice_date: date
    description: str = Field(default="", max_length=500)
    amount_cents: int = Field(ge=0)
    vat_cents: int = Field(default=0, ge=0)


class SubcontractorInvoiceResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    assignment_id: uuid.UUID | None
    invoice_reference: str
    invoice_date: date
    description: str
    amount_cents: int
    vat_cents: int
    status: str
    journal_entry_id: uuid.UUID | None
    reconciled_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


SubcontractorInvoiceListResponse = PagedResponse[SubcontractorInvoiceResponse]
