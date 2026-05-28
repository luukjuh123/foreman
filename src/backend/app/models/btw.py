"""BTW (VAT) aangifte model.

Stores quarterly Dutch BTW return data. All monetary values in integer euro cents.
Boxes follow the official Dutch BTW aangifte form numbering.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

BTW_STATUSES = ("draft", "submitted", "accepted")


class BtwAangifte(Base):
    """Quarterly Dutch BTW (VAT) return per owner."""

    __tablename__ = "btw_aangiftes"
    __table_args__ = (
        UniqueConstraint("owner_id", "year", "quarter", name="uq_btw_owner_year_quarter"),
        CheckConstraint("quarter BETWEEN 1 AND 4", name="ck_btw_quarter_valid"),
        CheckConstraint("year >= 2000", name="ck_btw_year_valid"),
        CheckConstraint(
            "status IN ('draft','submitted','accepted')",
            name="ck_btw_status_valid",
        ),
        Index("ix_btw_aangiftes_owner_year", "owner_id", "year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    year: Mapped[int] = mapped_column(Integer, nullable=False)
    quarter: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)

    # Box 1: Prestaties binnen Nederland
    # 1a: leveringen/diensten belast met hoog tarief (21%) — net amount
    box_1a_net_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 1b: leveringen/diensten belast met laag tarief (9%) — net amount
    box_1b_net_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 1c: leveringen/diensten belast met overige tarieven (0%) — net amount
    box_1c_net_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 1d: privégebruik — net amount (simplified: always 0 for construction)
    box_1d_net_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Box 5: Totaalberekening
    # 5a: totaal BTW verschuldigd (output VAT on sales)
    box_5a_vat_due_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 5b: totaal voorbelasting (input VAT / aftrekbare BTW)
    box_5b_voorbelasting_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 5d: te betalen / terug te ontvangen (5a - 5b, positive = payable)
    box_5d_payable_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
