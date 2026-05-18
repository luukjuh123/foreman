"""Billing schemas — subscription responses."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    tier: str
    status: str
    project_limit: int | None
    current_period_end: datetime | None = None
    trial_ends_at: datetime | None = None

    model_config = {"from_attributes": True}
