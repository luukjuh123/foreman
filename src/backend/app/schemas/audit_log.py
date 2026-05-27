"""Pydantic schemas for AuditLog."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    resource_type: str
    resource_id: uuid.UUID
    diff: dict | None
    ip_address: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    data: list[AuditLogResponse]
    total: int
    page: int
    per_page: int
