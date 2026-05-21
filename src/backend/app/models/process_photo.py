"""ProcessPhoto model — uploaded site photos with AI-recognized process.

A photo references its project (FK) and optionally the recognized Process
(FK) plus an integer 0-100 completion estimate. Raw analysis JSON is
preserved for audit.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class ProcessPhoto(Base):
    __tablename__ = "process_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Recognized process — nullable because recognition may fail or return unknown.
    recognized_process_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("processes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    image_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    completion_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
