"""Pydantic schemas for Subcontractor management."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class SubcontractorCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    specialty: str | None = None
    hourly_rate_cents: int = Field(ge=0)
    notes: str | None = None
    active: bool = True


class SubcontractorUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    specialty: str | None = None
    hourly_rate_cents: int | None = Field(default=None, ge=0)
    notes: str | None = None
    active: bool | None = None


class SubcontractorResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    company_name: str
    contact_name: str | None
    email: str | None
    phone: str | None
    specialty: str | None
    hourly_rate_cents: int
    notes: str | None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubcontractorListResponse(BaseModel):
    data: list[SubcontractorResponse]
    total: int
    page: int
    per_page: int


# Project access


class ProjectAccessCreate(BaseModel):
    project_id: uuid.UUID


class ProjectAccessResponse(BaseModel):
    id: uuid.UUID
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    granted_at: datetime

    model_config = {"from_attributes": True}


# Hour entries


class HourEntryCreate(BaseModel):
    project_id: uuid.UUID
    work_date: date
    hours: float = Field(gt=0)
    description: str | None = None


class HourEntryResponse(BaseModel):
    id: uuid.UUID
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    work_date: date
    hours: float
    cost_cents: int
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# Invoices


class SubcontractorInvoiceCreate(BaseModel):
    project_id: uuid.UUID
    invoice_number: str = Field(min_length=1, max_length=100)
    invoice_date: date
    amount_cents: int = Field(gt=0)
    description: str | None = None


class SubcontractorInvoiceUpdate(BaseModel):
    status: str = Field(pattern="^(pending|paid|disputed)$")


class SubcontractorInvoiceResponse(BaseModel):
    id: uuid.UUID
    subcontractor_id: uuid.UUID
    project_id: uuid.UUID
    invoice_number: str
    invoice_date: date
    amount_cents: int
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
