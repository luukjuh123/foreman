"""Pydantic schemas for Equipment/tool tracking."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class EquipmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(default="tool", min_length=1, max_length=100)
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_price_cents: int = Field(default=0, ge=0)
    notes: str | None = None
    status: str = Field(default="available", pattern="^(available|in_use|maintenance|retired)$")


class EquipmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_price_cents: int | None = Field(default=None, ge=0)
    notes: str | None = None
    status: str | None = Field(default=None, pattern="^(available|in_use|maintenance|retired)$")


class EquipmentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    category: str
    serial_number: str | None
    purchase_date: date | None
    purchase_price_cents: int
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EquipmentListResponse(BaseModel):
    data: list[EquipmentResponse]
    total: int
    page: int
    per_page: int


# Assignments


class AssignmentCreate(BaseModel):
    project_id: uuid.UUID
    assigned_date: date
    notes: str | None = None


class AssignmentUpdate(BaseModel):
    returned_date: date | None = None
    notes: str | None = None


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    project_id: uuid.UUID
    assigned_date: date
    returned_date: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Maintenance


class MaintenanceCreate(BaseModel):
    maintenance_date: date
    description: str = Field(min_length=1)
    cost_cents: int = Field(default=0, ge=0)
    next_due_date: date | None = None
    performed_by: str | None = None


class MaintenanceResponse(BaseModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    maintenance_date: date
    description: str
    cost_cents: int
    next_due_date: date | None
    performed_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
