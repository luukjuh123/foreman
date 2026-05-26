"""Subcontractor models — Phase 19.

Tracks external contractors, their project access grants,
logged hours, and invoices.
"""

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Subcontractor(Base):
    """An external contractor company or individual."""

    __tablename__ = "subcontractors"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    specialty: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Agreed hourly rate in euro cents
    hourly_rate_cents: Mapped[int] = mapped_column(nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project_access: Mapped[list["SubcontractorProjectAccess"]] = relationship(
        back_populates="subcontractor", cascade="all, delete-orphan"
    )
    hours: Mapped[list["SubcontractorHourEntry"]] = relationship(
        back_populates="subcontractor", cascade="all, delete-orphan"
    )
    invoices: Mapped[list["SubcontractorInvoice"]] = relationship(
        back_populates="subcontractor", cascade="all, delete-orphan"
    )

    __table_args__ = (CheckConstraint("hourly_rate_cents >= 0", name="ck_sub_hourly_rate_non_negative"),)


class SubcontractorProjectAccess(Base):
    """Grants a subcontractor limited read access to a project."""

    __tablename__ = "subcontractor_project_access"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subcontractor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subcontractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subcontractor: Mapped["Subcontractor"] = relationship(back_populates="project_access")


class SubcontractorHourEntry(Base):
    """Hours logged by a subcontractor against a project."""

    __tablename__ = "subcontractor_hour_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subcontractor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subcontractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    hours: Mapped[float] = mapped_column(nullable=False)
    # Cost at the subcontractor's hourly rate at time of logging (euro cents)
    cost_cents: Mapped[int] = mapped_column(nullable=False, default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subcontractor: Mapped["Subcontractor"] = relationship(back_populates="hours")

    __table_args__ = (CheckConstraint("hours > 0", name="ck_sub_hours_positive"),)


class SubcontractorInvoice(Base):
    """An invoice received from a subcontractor for project work."""

    __tablename__ = "subcontractor_invoices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subcontractor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subcontractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Amount in euro cents
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # pending | paid | disputed
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    subcontractor: Mapped["Subcontractor"] = relationship(back_populates="invoices")

    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_sub_invoice_amount_positive"),
        CheckConstraint("status IN ('pending', 'paid', 'disputed')", name="ck_sub_invoice_status"),
    )
