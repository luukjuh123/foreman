"""Pydantic schemas for process analytics."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class ProcessStatsResponse(BaseModel):
    process_id: uuid.UUID
    process_slug: str
    process_name: str
    entry_count: int
    project_count: int
    total_seconds: int
    avg_seconds: float | None


class ProcessStatsListResponse(BaseModel):
    data: list[ProcessStatsResponse]
