"""Quote domain models: Quote, QuoteLineItem.

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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Quote lifecycle states.
QUOTE_STATUSES: tuple[str, ...] = ("draft", "sent", "accepted", "rejected", "expired")


class Quote(Base):
    """An AI-generated quote (offerte) belonging to a single owner."""

    __tablename__ = "quotes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    project_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    # All monetary values in euro cents.
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    vat_total_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)

    # AI estimation metadata (JSON-serialised, stored as text for portability)
    ai_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Acceptance tracking
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[list[QuoteLineItem]] = relationship(
        back_populates="quote",
        cascade="all, delete-orphan",
        order_by="QuoteLineItem.position",
    )


class QuoteLineItem(Base):
    """A single line item on a quote."""

    __tablename__ = "quote_line_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotes.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(20), default="piece")
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    vat_rate_bp: Mapped[int] = mapped_column(Integer, nullable=False)

    # Computed at create/update time and persisted.
    line_net_cents: Mapped[int] = mapped_column(Integer, default=0)
    line_vat_cents: Mapped[int] = mapped_column(Integer, default=0)

    quote: Mapped[Quote] = relationship(back_populates="lines")
