"""Subscription model — free / paid tiers per user account."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SubscriptionTier(str, enum.Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"


# Project limits per tier. ``None`` means unlimited.
TIER_PROJECT_LIMIT: dict[SubscriptionTier, int | None] = {
    SubscriptionTier.FREE: 1,
    SubscriptionTier.STARTER: None,
    SubscriptionTier.PRO: None,
}


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    tier: Mapped[str] = mapped_column(String(50), default=SubscriptionTier.FREE.value)
    status: Mapped[str] = mapped_column(
        String(50), default=SubscriptionStatus.ACTIVE.value
    )
    # NULL = unlimited. Limit is set explicitly by service helpers per-tier.
    project_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # External payment-provider references (used by the Mollie integration).
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    provider_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
