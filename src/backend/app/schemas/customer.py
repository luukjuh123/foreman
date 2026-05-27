"""Pydantic schemas for Customer.

Uses the Customer model from app.models.invoice (the canonical, auth-scoped model).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    email: str | None = None
    kvk_number: str | None = None
    vat_number: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str = "NL"


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    kvk_number: str | None = None
    vat_number: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str | None = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    email: str | None
    kvk_number: str | None
    vat_number: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country_code: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
