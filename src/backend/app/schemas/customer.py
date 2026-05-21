"""Pydantic schemas for Customer."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    postal_code: str | None = None
    city: str | None = None
    kvk_number: str | None = None
    vat_number: str | None = None
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address_line1: str | None = None
    postal_code: str | None = None
    city: str | None = None
    kvk_number: str | None = None
    vat_number: str | None = None
    notes: str | None = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    contact_name: str | None
    email: str | None
    phone: str | None
    address_line1: str | None
    postal_code: str | None
    city: str | None
    kvk_number: str | None
    vat_number: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerListResponse(BaseModel):
    data: list[CustomerResponse]
    total: int
    page: int
    per_page: int
