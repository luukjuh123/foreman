"""Pydantic schemas for offertes (quotations)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.models.invoice import ALLOWED_VAT_RATES_BP
from pydantic import BaseModel, ConfigDict, Field, field_validator


class OfferteLineCreate(BaseModel):
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


class OfferteLineResponse(BaseModel):
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


class OfferteCreate(BaseModel):
    customer_id: uuid.UUID
    issue_date: date
    valid_until: date
    notes: str | None = None
    terms_conditions: str | None = None
    lines: list[OfferteLineCreate] = Field(min_length=1)


class OfferteUpdate(BaseModel):
    notes: str | None = None
    terms_conditions: str | None = None
    valid_until: date | None = None


class OfferteAccept(BaseModel):
    create_invoice: bool = False


class OfferteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    customer_id: uuid.UUID
    offerte_number: str
    issue_date: date
    valid_until: date
    status: str
    notes: str | None
    terms_conditions: str | None
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    invoice_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    lines: list[OfferteLineResponse] = []


class OfferteListResponse(BaseModel):
    data: list[OfferteResponse]
    total: int
