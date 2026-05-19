"""Pydantic schemas for Budget and BudgetItem."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

BudgetCategory = Literal["materials", "labor", "equipment", "overhead", "other"]


class BudgetItemCreate(BaseModel):
    category: BudgetCategory
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    estimated_cents: int = Field(ge=0)
    actual_cents: int = Field(default=0, ge=0)


class BudgetItemUpdate(BaseModel):
    category: BudgetCategory | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    estimated_cents: int | None = Field(default=None, ge=0)
    actual_cents: int | None = Field(default=None, ge=0)


class BudgetItemResponse(BaseModel):
    id: uuid.UUID
    budget_id: uuid.UUID
    category: BudgetCategory
    name: str
    description: str | None
    estimated_cents: int
    actual_cents: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetUpsert(BaseModel):
    total_budget_cents: int = Field(ge=0)
    contingency_pct: float = Field(default=10.0, ge=0.0, le=100.0)


class BudgetResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    total_budget_cents: int
    contingency_pct: float
    created_at: datetime
    updated_at: datetime
    items: list[BudgetItemResponse] = []

    model_config = {"from_attributes": True}
