"""Pydantic schemas for the profitability analytics endpoint."""

import uuid

from pydantic import BaseModel


class ProjectMargin(BaseModel):
    project_id: uuid.UUID
    project_name: str
    revenue_cents: int
    labor_cost_cents: int
    material_cost_cents: int
    margin_cents: int
    margin_percentage: float


class ProfitabilityResponse(BaseModel):
    items: list[ProjectMargin]
