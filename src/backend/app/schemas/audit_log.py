"""Pydantic schemas for AuditLog."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID
    before_data: dict[str, Any] | None
    after_data: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    data: list[AuditLogResponse]
    total: int
    page: int
    per_page: int


class AuditLogListParams(BaseModel):
    user_id: uuid.UUID | None = None
    entity_type: str | None = None
    action: Literal["create", "update", "delete"] | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    page: int = 1
    per_page: int = 20
