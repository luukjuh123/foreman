"""Pydantic schemas for inbound customer inquiries."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr


class InboundEmailRequest(BaseModel):
    from_email: EmailStr
    from_name: str | None = None
    subject: str | None = None
    body: str = ""
    raw: dict[str, Any] | None = None


class InboundFormRequest(BaseModel):
    name: str
    email: EmailStr
    message: str
    phone: str | None = None


class InboundInquiryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: str
    from_email: str | None
    from_name: str | None
    subject: str | None
    body: str
    status: str
    created_at: datetime


class InboundInquiryEnvelope(BaseModel):
    data: InboundInquiryResponse | None
    error: dict[str, Any] | None = None
