"""Pydantic schemas for Customer."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str | None = None
    kvk_number: str | None = Field(default=None, max_length=20)
    vat_number: str | None = Field(default=None, max_length=20)
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str = Field(default="NL", min_length=2, max_length=2)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = None
    kvk_number: str | None = Field(default=None, max_length=20)
    vat_number: str | None = Field(default=None, max_length=20)
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str | None = Field(default=None, min_length=2, max_length=2)


class CustomerResponse(BaseModel):
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
