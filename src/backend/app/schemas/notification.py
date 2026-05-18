"""Pydantic schemas for notifications."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    title: str
    body: str
    data: dict[str, Any] | None
    channels_dispatched: list[str]
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    data: list[NotificationResponse]
    error: None = None
    unread_count: int


class NotificationEnvelope(BaseModel):
    data: NotificationResponse | None
    error: dict[str, Any] | None = None
