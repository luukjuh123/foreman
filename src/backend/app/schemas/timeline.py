"""Pydantic schemas for customer communication timeline."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

EventType = Literal[
    "invoice_sent",
    "invoice_paid",
    "invoice_overdue",
    "report_shared",
    "review_posted",
    "review_replied",
    "email_sent",
    "payment_received",
]


class TimelineEvent(BaseModel):
    id: str
    event_type: EventType
    timestamp: datetime
    title: str
    description: str
    metadata: dict[str, Any]


class TimelineResponse(BaseModel):
    items: list[TimelineEvent]
    total: int
    offset: int
    limit: int
