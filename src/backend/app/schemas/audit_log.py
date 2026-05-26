"""Pydantic schemas for AuditLog."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    actor_id: uuid.UUID
    actor_email: str
    changes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
