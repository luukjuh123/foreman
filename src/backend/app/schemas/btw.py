"""Pydantic schemas for BTW aangifte endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BtwStatus = Literal["draft", "submitted", "accepted"]


class BtwGenerateRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    quarter: int = Field(ge=1, le=4)


class BtwAangifteUpdate(BaseModel):
    notes: str | None = None
    status: BtwStatus | None = None
    # Override fields (manual corrections by accountant)
    box_1a_net_cents: int | None = Field(default=None, ge=0)
    box_1b_net_cents: int | None = Field(default=None, ge=0)
    box_1c_net_cents: int | None = Field(default=None, ge=0)
    box_1d_net_cents: int | None = Field(default=None, ge=0)
    box_5a_vat_due_cents: int | None = Field(default=None, ge=0)
    box_5b_voorbelasting_cents: int | None = Field(default=None, ge=0)
    box_5d_payable_cents: int | None = None


class BtwAangifteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    year: int
    quarter: int
    status: str

    box_1a_net_cents: int
    box_1b_net_cents: int
    box_1c_net_cents: int
    box_1d_net_cents: int
    box_5a_vat_due_cents: int
    box_5b_voorbelasting_cents: int
    box_5d_payable_cents: int

    notes: str | None
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime
