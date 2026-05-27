"""Pydantic schemas for PunchItem (nakijklijst)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

PunchItemStatus = Literal["open", "fixed", "verified"]


class PunchItemCreate(BaseModel):
    task_id: uuid.UUID | None = None
    description: str
    status: PunchItemStatus = "open"
    assigned_staff_id: uuid.UUID | None = None
    photo_before_url: str | None = None
    photo_after_url: str | None = None


class PunchItemUpdate(BaseModel):
    description: str | None = None
    status: PunchItemStatus | None = None
    assigned_staff_id: uuid.UUID | None = None
    photo_before_url: str | None = None
    photo_after_url: str | None = None


class PunchItemResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    task_id: uuid.UUID | None
    description: str
    status: str
    assigned_staff_id: uuid.UUID | None
    photo_before_url: str | None
    photo_after_url: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class PunchItemListResponse(BaseModel):
    data: list[PunchItemResponse]
    total: int


class BulkStatusUpdate(BaseModel):
    ids: list[uuid.UUID]
    status: PunchItemStatus


class BulkStatusResult(BaseModel):
    updated: int


class PunchItemSummary(BaseModel):
    task_id: uuid.UUID | None
    task_name: str | None
    open: int
    fixed: int
    verified: int
    total: int
