"""Pydantic schemas for push subscription endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


class PushSubscriptionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    endpoint: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VapidKeyResponse(BaseModel):
    public_key: str
