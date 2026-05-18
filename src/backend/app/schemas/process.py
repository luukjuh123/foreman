"""Pydantic schemas for Process and ProjectProcess."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProcessCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    unit: str = Field(default="m2", min_length=1, max_length=20)


class ProcessUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    unit: str | None = None


class ProcessResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    unit: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProcessListResponse(BaseModel):
    data: list[ProcessResponse]
    total: int


class ProjectProcessAttach(BaseModel):
    process_id: uuid.UUID
    notes: str | None = None


class ProjectProcessResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    process_id: uuid.UUID
    notes: str | None
    created_at: datetime
    process: ProcessResponse

    model_config = {"from_attributes": True}


class ProjectProcessListResponse(BaseModel):
    data: list[ProjectProcessResponse]
