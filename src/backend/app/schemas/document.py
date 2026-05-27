"""Pydantic schemas for Document."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    uploaded_by: uuid.UUID
    name: str
    description: str | None
    category: str
    mime_type: str
    size_bytes: int
    version: int
    parent_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


class DocumentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
