"""Inbound customer-inquiry persistence (email + form leads)."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import JSON, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class InboundInquiry(Base):
    __tablename__ = "inbound_inquiries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # 'email' (forwarded email webhook) or 'form' (website contact form).
    source: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Raw provider payload (email headers, form metadata, etc.).
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 'new' | 'acknowledged' | 'closed'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
