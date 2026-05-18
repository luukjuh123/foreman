"""Pydantic schemas for invoices and customers."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.invoice import ALLOWED_VAT_RATES_BP, INVOICE_STATUSES


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    kvk_number: str | None = Field(default=None, max_length=20)
    vat_number: str | None = Field(default=None, max_length=20)
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str = Field(default="NL", min_length=2, max_length=2)


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str | None
    kvk_number: str | None
    vat_number: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country_code: str


class InvoiceLineCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: float = Field(gt=0)
    unit: str = Field(default="piece", max_length=20)
    unit_price_cents: int = Field(ge=0)
    vat_rate_bp: int

    @field_validator("vat_rate_bp")
    @classmethod
    def _check_vat(cls, v: int) -> int:
        if v not in ALLOWED_VAT_RATES_BP:
            msg = f"vat_rate_bp must be one of {ALLOWED_VAT_RATES_BP}"
            raise ValueError(msg)
        return v


class InvoiceLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    description: str
    quantity: float
    unit: str
    unit_price_cents: int
    vat_rate_bp: int
    line_net_cents: int
    line_vat_cents: int


class InvoiceCreate(BaseModel):
    customer_id: uuid.UUID
    project_id: uuid.UUID | None = None
    issue_date: date
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    notes: str | None = None
    lines: list[InvoiceLineCreate] = Field(min_length=1)


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    project_id: uuid.UUID | None
    invoice_number: str
    issue_date: date
    due_date: date
    payment_terms_days: int
    currency: str
    status: str
    notes: str | None
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    sent_at: datetime | None
    paid_at: datetime | None
    lines: list[InvoiceLineResponse] = []


class InvoiceListResponse(BaseModel):
    data: list[InvoiceResponse]
    total: int
    page: int
    per_page: int


class InvoiceStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str) -> str:
        if v not in INVOICE_STATUSES:
            msg = f"status must be one of {INVOICE_STATUSES}"
            raise ValueError(msg)
        return v
