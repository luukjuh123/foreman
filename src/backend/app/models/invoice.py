"""Invoice domain models: Customer, Invoice, InvoiceLine, InvoiceCounter.

Money is stored as integer euro cents.
VAT rates are stored as integer basis points (e.g. 2100 = 21%).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Allowed Dutch VAT rates in basis points.
ALLOWED_VAT_RATES_BP: tuple[int, ...] = (0, 900, 2100)

# Invoice lifecycle states.
INVOICE_STATUSES: tuple[str, ...] = ("draft", "sent", "paid", "overdue", "cancelled")


class Customer(Base):
    """Billing party for invoices, scoped per owner."""

    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kvk_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vat_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country_code: Mapped[str] = mapped_column(String(2), default="NL")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Invoice(Base):
    """A Dutch e-invoice belonging to a single owner."""

    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("owner_id", "invoice_number", name="uq_invoice_owner_number"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)

    invoice_number: Mapped[str] = mapped_column(String(20), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # All monetary values in euro cents.
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    vat_total_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLine.position",
    )


class InvoiceLine(Base):
    """A single line item on an invoice."""

    __tablename__ = "invoice_lines"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(20), default="piece")
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate_bp: Mapped[int] = mapped_column(Integer, nullable=False)

    # Computed at create/update time and persisted for fast aggregation.
    line_net_cents: Mapped[int] = mapped_column(Integer, default=0)
    line_vat_cents: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class InvoiceCounter(Base):
    """Monotonic counter for invoice numbers, scoped per owner per year."""

    __tablename__ = "invoice_counters"
    __table_args__ = (UniqueConstraint("owner_id", "year", name="uq_invoice_counter_owner_year"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
