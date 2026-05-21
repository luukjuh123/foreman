"""Per-user notification preferences ORM model."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # {"<notification_type>": {"email": false, "push": true, ...}}
    type_overrides: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
