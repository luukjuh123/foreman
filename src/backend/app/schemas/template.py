"""Pydantic schemas for ProjectTemplate."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class TemplateTaskSchema(BaseModel):
    name: str
    description: str | None = None
    estimated_hours: float = 0.0
    priority: int = 0


class TemplatePhaseSchema(BaseModel):
    name: str
    description: str | None = None
    order_index: int = 0
    tasks: list[TemplateTaskSchema] = []


class ProjectTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    structure: list[TemplatePhaseSchema] = []


class ProjectTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    structure: list[TemplatePhaseSchema] | None = None


class ProjectTemplateResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None
    category: str | None
    structure: list[TemplatePhaseSchema]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectTemplateListResponse(BaseModel):
    data: list[ProjectTemplateResponse]
    total: int
    page: int
    per_page: int


class CreateFromTemplateRequest(BaseModel):
    project_name: str
    start_date: date | None = None


class FromProjectRequest(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
