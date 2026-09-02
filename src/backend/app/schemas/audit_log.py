"""Pydantic schemas for AuditLog."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID
    diff: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_entry(cls, entry) -> "AuditLogResponse":
        return cls(
            id=entry.id,
            user_id=entry.user_id,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            diff=entry.diff,
            created_at=entry.created_at,
        )


class AuditLogListResponse(BaseModel):
    data: list[AuditLogResponse]
    total: int
    page: int
    per_page: int
