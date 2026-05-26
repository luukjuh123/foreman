"""Pydantic schemas for Incident / damage reports."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

SeverityLiteral = Literal["low", "medium", "high", "critical"]
CategoryLiteral = Literal["injury", "property_damage", "near_miss", "environmental", "theft", "other"]
StatusLiteral = Literal["reported", "investigating", "resolved", "closed"]


class IncidentCreate(BaseModel):
    title: str
    description: str
    severity: SeverityLiteral
    category: CategoryLiteral
    incident_date: date

    project_id: uuid.UUID | None = None
    incident_time: str | None = None
    location: str | None = None
    reported_by: str | None = None
    witnesses: str | None = None
    corrective_action: str | None = None
    damage_cost_cents: int = 0


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: SeverityLiteral | None = None
    category: CategoryLiteral | None = None
    status: StatusLiteral | None = None
    incident_date: date | None = None
    incident_time: str | None = None
    location: str | None = None
    reported_by: str | None = None
    witnesses: str | None = None
    corrective_action: str | None = None
    damage_cost_cents: int | None = None
    project_id: uuid.UUID | None = None


class IncidentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    project_id: uuid.UUID | None
    title: str
    description: str
    severity: str
    category: str
    status: str
    incident_date: date
    incident_time: str | None
    location: str | None
    reported_by: str | None
    witnesses: str | None
    corrective_action: str | None
    damage_cost_cents: int
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IncidentListResponse(BaseModel):
    data: list[IncidentResponse]
    total: int
    page: int
    per_page: int


class IncidentStatsResponse(BaseModel):
    total_incidents: int
    by_severity: dict[str, int]
    by_category: dict[str, int]
    total_damage_cost_cents: int
