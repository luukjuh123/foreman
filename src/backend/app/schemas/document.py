"""Pydantic schemas for Document."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentUploadResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    category: str
    mime_type: str
    size_bytes: int
    storage_path: str
    version: int
    uploaded_by_id: uuid.UUID
    created_at: datetime
    download_url: str

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
