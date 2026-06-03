"""Staff and StaffAvailability models — Phase 9.
StaffCertification model — Phase 21.
"""

import uuid
from datetime import date, datetime, time

from app.core.database import Base
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Staff(Base):
    """An employee or contractor working under a planner account."""

    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    hourly_rate_cents: Mapped[int] = mapped_column(nullable=False, default=0)
    weekly_hours_target: Mapped[float] = mapped_column(default=40.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    availability: Mapped[list["StaffAvailability"]] = relationship(back_populates="staff", cascade="all, delete-orphan")
    certifications: Mapped[list["StaffCertification"]] = relationship(
        back_populates="staff", cascade="all, delete-orphan"
    )

    __table_args__ = (CheckConstraint("hourly_rate_cents >= 0", name="ck_staff_hourly_rate_non_negative"),)


class StaffAvailability(Base):
    """A recurring weekly availability window for a staff member."""

    __tablename__ = "staff_availability"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    staff: Mapped["Staff"] = relationship(back_populates="availability")

    __table_args__ = (
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6", name="ck_staff_avail_dow_range"),
        CheckConstraint("end_time > start_time", name="ck_staff_avail_time_order"),
    )


# Valid certification types for Dutch construction sector
CERT_TYPES = ("VCA", "BHV", "crane_license", "asbestos", "other")


class StaffCertification(Base):
    """A professional certification held by a staff member."""

    __tablename__ = "staff_certifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    cert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    cert_name: Mapped[str] = mapped_column(String(255), nullable=False)
    issued_at: Mapped[date] = mapped_column(Date, nullable=False)
    expires_at: Mapped[date] = mapped_column(Date, nullable=False)
    document_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    staff: Mapped["Staff"] = relationship(back_populates="certifications")
