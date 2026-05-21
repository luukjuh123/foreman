"""TimeEntry model — hours worked per staff per project/task — Phase 9."""

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column


class TimeEntry(Base):
    """A logged block of hours worked by a staff member on a given date.

    Stores a snapshot of the hourly rate at entry time so historical payroll
    calculations remain correct even if the staff member's rate changes later.
    """

    __tablename__ = "time_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hours: Mapped[float] = mapped_column(nullable=False)
    # Snapshot of hourly_rate_cents at moment of entry
    hourly_rate_cents_snapshot: Mapped[int] = mapped_column(nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint("hours > 0 AND hours <= 24", name="ck_time_entry_hours_range"),
        CheckConstraint(
            "hourly_rate_cents_snapshot >= 0", name="ck_time_entry_rate_non_negative"
        ),
    )
