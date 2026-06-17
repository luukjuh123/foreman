"""Quote domain models: Quote, QuoteLine, QuoteCounter.

Money stored as integer euro cents.
VAT rates stored as integer basis points (e.g. 2100 = 21%).
Quote numbers formatted as OFF-YYYY-NNNN.
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

# Quote lifecycle states.
QUOTE_STATUSES: tuple[str, ...] = ("draft", "sent", "accepted", "rejected", "expired")


class Quote(Base):
    """An offerte (quote) belonging to a single owner."""

    __tablename__ = "quotes"
    __table_args__ = (UniqueConstraint("owner_id", "quote_number", name="uq_quote_owner_number"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)

    quote_number: Mapped[str] = mapped_column(String(20), nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # All monetary values in euro cents.
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    vat_total_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[list[QuoteLine]] = relationship(
        back_populates="quote",
        cascade="all, delete-orphan",
        order_by="QuoteLine.position",
    )


class QuoteLine(Base):
    """A single line item on a quote."""

    __tablename__ = "quote_lines"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotes.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(20), default="piece")
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate_bp: Mapped[int] = mapped_column(Integer, nullable=False)

    # Computed at create/update time and persisted for fast aggregation.
    line_net_cents: Mapped[int] = mapped_column(Integer, default=0)
    line_vat_cents: Mapped[int] = mapped_column(Integer, default=0)

    quote: Mapped[Quote] = relationship(back_populates="lines")


class QuoteCounter(Base):
    """Monotonic counter for quote numbers, scoped per owner per year."""

    __tablename__ = "quote_counters"
    __table_args__ = (UniqueConstraint("owner_id", "year", name="uq_quote_counter_owner_year"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
