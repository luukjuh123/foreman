"""Pydantic schemas for reports."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel


class ReportGenerateRequest(BaseModel):
    project_id: str
    type: Literal["weekly", "completion"]
    period_start: date | None = None
    period_end: date | None = None


class ReportResponse(BaseModel):
    id: str
    project_id: str
    type: str
    title: str
    period_start: date | None
    period_end: date | None
    data: dict[str, Any]
    is_shared: bool
    share_token: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportSummaryResponse(BaseModel):
    """Report without the full data payload — for list views."""

    id: str
    project_id: str
    type: str
    title: str
    period_start: date | None
    period_end: date | None
    is_shared: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportListResponse(BaseModel):
    data: list[ReportSummaryResponse]
    total: int
    page: int
    per_page: int


class ReportShareResponse(BaseModel):
    share_token: str | None
    share_url: str
