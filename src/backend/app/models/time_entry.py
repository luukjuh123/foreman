"""Time tracking entries for project↔process work.

A `ProcessTimeEntry` records a start (required) and a stop (nullable while
running). Durations are stored in **seconds** as a non-negative integer and
populated on stop. Only one open (stop_at IS NULL) entry per project_process
is allowed.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class ProcessTimeEntry(Base):
    __tablename__ = "process_time_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_process_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_processes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Duration in seconds; nullable while running, set on stop.
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
