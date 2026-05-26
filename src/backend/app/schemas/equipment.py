"""Pydantic schemas for Equipment, EquipmentAssignment, and EquipmentMaintenance."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# EquipmentAssignment
# ---------------------------------------------------------------------------

EquipmentStatus = Literal["available", "in_use", "maintenance", "retired"]


class EquipmentAssignmentCreate(BaseModel):
    project_id: uuid.UUID
    assigned_date: date
    returned_date: date | None = None
    notes: str | None = None


class EquipmentAssignmentUpdate(BaseModel):
    returned_date: date | None = None
    notes: str | None = None


class EquipmentAssignmentResponse(BaseModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    project_id: uuid.UUID
    assigned_date: date
    returned_date: date | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Equipment
# ---------------------------------------------------------------------------


class EquipmentCreate(BaseModel):
    name: str
    category: str = "tool"
    status: EquipmentStatus = "available"
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_price_cents: int = 0
    daily_rental_cost_cents: int = 0
    notes: str | None = None


class EquipmentUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    status: EquipmentStatus | None = None
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_price_cents: int | None = None
    daily_rental_cost_cents: int | None = None
    notes: str | None = None


class EquipmentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    category: str
    status: str
    serial_number: str | None
    purchase_date: date | None
    purchase_price_cents: int
    daily_rental_cost_cents: int
    notes: str | None
    created_at: datetime
    updated_at: datetime
    assignments: list[EquipmentAssignmentResponse] = []

    model_config = {"from_attributes": True}


class EquipmentListResponse(BaseModel):
    data: list[EquipmentResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# EquipmentMaintenance
# ---------------------------------------------------------------------------


class MaintenanceCreate(BaseModel):
    maintenance_date: date
    description: str
    cost_cents: int = 0
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
