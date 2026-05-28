"""Pydantic schemas for accounting export endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


class MT940ExportRequest(BaseModel):
    date_from: str  # ISO date string YYYY-MM-DD
    date_to: str
    account_number: str
    bank_id: str

    @model_validator(mode="after")
    def date_range_valid(self) -> MT940ExportRequest:
        if self.date_to < self.date_from:
            raise ValueError("date_to must be >= date_from")
        return self


class CSVExportRequest(BaseModel):
    date_from: str  # ISO date string YYYY-MM-DD
    date_to: str

    @model_validator(mode="after")
    def date_range_valid(self) -> CSVExportRequest:
        if self.date_to < self.date_from:
            raise ValueError("date_to must be >= date_from")
        return self


ExportFormat = Literal["mt940", "csv_journal", "csv_invoices"]


class ExportHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    format: str
    date_from: str
    date_to: str
    row_count: int
    exported_at: datetime
