"""PushSubscription ORM model — stores Web Push VAPID subscriptions per user."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    # The push service endpoint URL (unique per browser+device)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    # ECDH public key from the PushSubscription.getKey("p256dh")
    p256dh: Mapped[str] = mapped_column(String(512), nullable=False)
    # Authentication secret from the PushSubscription.getKey("auth")
    auth: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
