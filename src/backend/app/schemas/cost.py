"""Pydantic response schemas for the financial cost endpoints."""

import uuid

from pydantic import BaseModel


class MaterialLineResponse(BaseModel):
    material_id: uuid.UUID
    name: str
    quantity: float
    unit: str
    unit_price_cents: int | None
    total_cents: int | None


class MaterialCostResponse(BaseModel):
    total_cents: int
    items: list[MaterialLineResponse]
    missing: list[MaterialLineResponse]


class TaskLaborResponse(BaseModel):
    task_id: uuid.UUID
    name: str
    estimated_hours: float
    cost_cents: int


class LaborCostResponse(BaseModel):
    hourly_rate_cents: int
    total_hours: float
    total_cents: int
    tasks: list[TaskLaborResponse]
