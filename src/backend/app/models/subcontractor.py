"""Subcontractor models — Phase 19: Subcontractor Management.

Money stored as integer euro cents.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Supported certification types.
CERT_TYPES: tuple[str, ...] = ("VCA", "BRL")

# Assignment lifecycle states.
ASSIGNMENT_STATUSES: tuple[str, ...] = ("planned", "active", "completed", "cancelled")


class Subcontractor(Base):
    """An external subcontractor company scoped per owner."""

    __tablename__ = "subcontractors"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    kvk_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Specialties stored as JSON-encoded text for SQLite compatibility.
    specialties_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # Hourly rate in euro cents.
    hourly_rate_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Fixed rate in euro cents (optional alternative to hourly).
    fixed_rate_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Rating 1-5; NULL means unrated.
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    certifications: Mapped[list[SubcontractorCertification]] = relationship(
        back_populates="subcontractor", cascade="all, delete-orphan"
    )
    assignments: Mapped[list[SubcontractorAssignment]] = relationship(
        back_populates="subcontractor", cascade="all, delete-orphan"
    )
    invoices: Mapped[list[SubcontractorInvoice]] = relationship(
        back_populates="subcontractor", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("hourly_rate_cents >= 0", name="ck_sub_hourly_rate_non_negative"),
        CheckConstraint("fixed_rate_cents IS NULL OR fixed_rate_cents >= 0", name="ck_sub_fixed_rate_non_negative"),
        CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_sub_rating_range"),
    )


class SubcontractorCertification(Base):
    """A certification held by a subcontractor (e.g. VCA, BRL) with expiry date."""

    __tablename__ = "subcontractor_certifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subcontractor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subcontractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cert_type: Mapped[str] = mapped_column(String(20), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subcontractor: Mapped[Subcontractor] = relationship(back_populates="certifications")

    __table_args__ = (CheckConstraint("cert_type IN ('VCA','BRL')", name="ck_sub_cert_type"),)


class SubcontractorAssignment(Base):
    """A work assignment for a subcontractor on a project phase or task."""

    __tablename__ = "subcontractor_assignments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    subcontractor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subcontractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phase_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("phases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")

    # Hourly-based pricing.
    estimated_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    actual_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    agreed_rate_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Fixed-price alternative — when set, total_cost = agreed_fixed_cost_cents.
    agreed_fixed_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Computed total cost (fixed cost takes precedence over hourly).
    total_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    subcontractor: Mapped[Subcontractor] = relationship(back_populates="assignments")

    __table_args__ = (
        CheckConstraint("estimated_hours >= 0", name="ck_sub_assign_est_hours_non_neg"),
        CheckConstraint("actual_hours >= 0", name="ck_sub_assign_actual_hours_non_neg"),
        CheckConstraint("agreed_rate_cents >= 0", name="ck_sub_assign_rate_non_neg"),
        CheckConstraint(
            "agreed_fixed_cost_cents IS NULL OR agreed_fixed_cost_cents >= 0",
            name="ck_sub_assign_fixed_cost_non_neg",
        ),
        Index("ix_sub_assign_project", "project_id", "subcontractor_id"),
    )


class SubcontractorInvoice(Base):
    """An invoice received from a subcontractor, linked to a project and optionally an assignment."""

    __tablename__ = "subcontractor_invoices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    subcontractor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subcontractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subcontractor_assignments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Set after reconciliation — points to the journal entry created.
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    )

    invoice_reference: Mapped[str] = mapped_column(String(100), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    # All monetary values in euro cents.
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # received | approved | reconciled | rejected
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="received", index=True)

    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    subcontractor: Mapped[Subcontractor] = relationship(back_populates="invoices")

    __table_args__ = (
        CheckConstraint("amount_cents >= 0", name="ck_sub_inv_amount_non_neg"),
        CheckConstraint("vat_cents >= 0", name="ck_sub_inv_vat_non_neg"),
        Index("ix_sub_inv_project_sub", "project_id", "subcontractor_id"),
    )
