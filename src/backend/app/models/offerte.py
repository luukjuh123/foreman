"""Offerte (quotation) domain models: Offerte, OfferteLine, OfferteCounter."""

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

OFFERTE_STATUSES: tuple[str, ...] = ("draft", "sent", "accepted", "rejected")


class Offerte(Base):
    """A quotation belonging to a single owner."""

    __tablename__ = "offertes"
    __table_args__ = (UniqueConstraint("owner_id", "offerte_number", name="uq_offerte_owner_number"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)

    offerte_number: Mapped[str] = mapped_column(String(20), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # All monetary values in euro cents.
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    vat_total_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Nullable FK to invoice created on acceptance.
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lines: Mapped[list[OfferteLine]] = relationship(
        back_populates="offerte",
        cascade="all, delete-orphan",
        order_by="OfferteLine.position",
    )


class OfferteLine(Base):
    """A single line item on an offerte."""

    __tablename__ = "offerte_lines"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    offerte_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("offertes.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(20), default="piece")
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate_bp: Mapped[int] = mapped_column(Integer, nullable=False)

    line_net_cents: Mapped[int] = mapped_column(Integer, default=0)
    line_vat_cents: Mapped[int] = mapped_column(Integer, default=0)

    offerte: Mapped[Offerte] = relationship(back_populates="lines")


class OfferteCounter(Base):
    """Monotonic counter for offerte numbers, scoped per owner per year."""

    __tablename__ = "offerte_counters"
    __table_args__ = (UniqueConstraint("owner_id", "year", name="uq_offerte_counter_owner_year"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
