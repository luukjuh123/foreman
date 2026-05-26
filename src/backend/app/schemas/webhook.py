"""Pydantic schemas for webhook endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AnyHttpUrl, BaseModel, field_validator

VALID_EVENTS = {
    "project.created",
    "project.updated",
    "project.deleted",
    "invoice.created",
    "invoice.paid",
    "invoice.overdue",
    "report.ready",
}


class WebhookCreate(BaseModel):
    url: AnyHttpUrl
    events: list[str]
    secret: str | None = None

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list[str]) -> list[str]:
        invalid = set(v) - VALID_EVENTS
        if invalid:
            raise ValueError(f"Unknown events: {invalid}. Valid: {VALID_EVENTS}")
        if not v:
            raise ValueError("At least one event is required")
        return v


class WebhookResponse(BaseModel):
    id: uuid.UUID
    url: str
    events: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}
