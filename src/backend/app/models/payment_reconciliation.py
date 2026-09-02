"""UnmatchedPayment model — stores Mollie payments that could not be matched to an invoice."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


class UnmatchedPayment(Base):
    """A Mollie payment that arrived but could not be auto-matched to any invoice.

    Surfaces for manual review via GET /api/invoices/payments/unmatched.
    """

    __tablename__ = "unmatched_payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    mollie_payment_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    # Amount in euro cents (e.g. €121.00 = 12100)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # The description / reference field from the Mollie payload
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_payload: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
