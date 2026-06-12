"""Pydantic schemas for Customer."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = Field(default=None, max_length=50)
    kvk_number: str | None = Field(default=None, max_length=20)
    vat_number: str | None = Field(default=None, max_length=20)
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str = Field(default="NL", min_length=2, max_length=2)
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = Field(default=None, max_length=50)
    kvk_number: str | None = Field(default=None, max_length=20)
    vat_number: str | None = Field(default=None, max_length=20)
    address_line1: str | None = None
    address_line2: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    notes: str | None = None


class CustomerResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    kvk_number: str | None
    vat_number: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country_code: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerListResponse(BaseModel):
    data: list[CustomerResponse]
    total: int
    page: int
    per_page: int


# --- Summary endpoint ---


class InvoiceSummaryItem(BaseModel):
    id: uuid.UUID
    invoice_number: str
    issue_date: str  # dd-MM-yyyy
    due_date: str  # dd-MM-yyyy
    status: str
    total_cents: int

    model_config = {"from_attributes": True}


class ProjectSummaryItem(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    start_date: str | None  # dd-MM-yyyy
    end_date: str | None  # dd-MM-yyyy

    model_config = {"from_attributes": True}


class CustomerSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    projects: list[ProjectSummaryItem]
    invoices: list[InvoiceSummaryItem]
    outstanding_cents: int  # sum of total_cents for non-paid, non-cancelled invoices
