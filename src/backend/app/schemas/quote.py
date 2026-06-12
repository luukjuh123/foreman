"""Pydantic schemas for quotes (offertes)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.models.quote import ALLOWED_VAT_RATES_BP, QUOTE_STATUSES
from pydantic import BaseModel, ConfigDict, Field, field_validator


class QuoteLineCreate(BaseModel):
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


class QuoteLineResponse(BaseModel):
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


class QuoteCreate(BaseModel):
    customer_id: uuid.UUID
    valid_until: date
    notes: str | None = None
    lines: list[QuoteLineCreate] = Field(min_length=1)


class QuoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    quote_number: str
    valid_until: date
    status: str
    notes: str | None
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    sent_at: datetime | None
    accepted_at: datetime | None
    rejected_at: datetime | None
    lines: list[QuoteLineResponse] = []


class QuoteListResponse(BaseModel):
    data: list[QuoteResponse]
    total: int
    page: int
    per_page: int


class QuoteStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str) -> str:
        if v not in QUOTE_STATUSES:
            msg = f"status must be one of {QUOTE_STATUSES}"
            raise ValueError(msg)
        return v


class QuoteConvertRequest(BaseModel):
    create_invoice: bool = False


class QuoteConvertResponse(BaseModel):
    project_id: uuid.UUID
    invoice_id: uuid.UUID | None = None
