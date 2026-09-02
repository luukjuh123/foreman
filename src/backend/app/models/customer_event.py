"""CustomerEvent model — communication timeline entry for a customer."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from app.core.database import Base
from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

try:
    from sqlalchemy import JSON
except ImportError:  # pragma: no cover
    from sqlalchemy import Text as JSON  # type: ignore[assignment]

# Allowed event types for the customer communication timeline.
CUSTOMER_EVENT_TYPES: tuple[str, ...] = (
    "invoice_sent",
    "report_shared",
    "email_sent",
    "review_response",
    "project_update",
    "quote_sent",
)


class CustomerEvent(Base):
    """A single interaction event on a customer's communication timeline."""

    __tablename__ = "customer_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("crm_customers.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
