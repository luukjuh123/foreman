"""Pydantic schemas for notifications."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

_ALLOWED_CHANNELS = {"in_app", "email", "push"}


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


class NotificationPreferencesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    in_app_enabled: bool
    email_enabled: bool
    push_enabled: bool
    type_overrides: dict[str, dict[str, bool]] | None


class NotificationPreferencesEnvelope(BaseModel):
    data: NotificationPreferencesResponse | None
    error: dict[str, Any] | None = None


class NotificationPreferencesUpdate(BaseModel):
    """Partial update — any field omitted keeps its current value."""

    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    push_enabled: bool | None = None
    type_overrides: dict[str, dict[str, bool]] | None = Field(default=None)

    @field_validator("type_overrides")
    @classmethod
    def _validate_overrides(cls, v):
        if v is None:
            return v
        for ntype, channels in v.items():
            if not isinstance(channels, dict):
                raise ValueError(f"override for {ntype!r} must be a mapping")
            unknown = set(channels) - _ALLOWED_CHANNELS
            if unknown:
                raise ValueError(
                    f"unknown channels in override for {ntype!r}: {sorted(unknown)}"
                )
        return v
