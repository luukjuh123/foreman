"""Export history — log of accounting exports triggered by a user."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

EXPORT_FORMATS = ("mt940", "csv_journal", "csv_invoices")


class ExportHistory(Base):
    """One record per accounting export triggered by a user."""

    __tablename__ = "export_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    format: Mapped[str] = mapped_column(String(20), nullable=False)
    date_from: Mapped[str] = mapped_column(String(10), nullable=False)  # ISO date string
    date_to: Mapped[str] = mapped_column(String(10), nullable=False)    # ISO date string
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    exported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
