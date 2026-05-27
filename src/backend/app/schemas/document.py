"""Pydantic schemas for Document management."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    uploaded_by_id: uuid.UUID
    filename: str
    storage_path: str
    content_type: str
    size_bytes: int
    category: str
    version: int
    parent_id: uuid.UUID | None
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    data: list[DocumentResponse]
    total: int
    page: int
    per_page: int


class DocumentUploadResponse(DocumentResponse):
    pass
