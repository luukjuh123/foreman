"""Subscription helpers — provisioning, trials, and project-limit enforcement."""

import uuid
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.models.project import Project
from app.models.subscription import (
    TIER_PROJECT_LIMIT,
    Subscription,
    SubscriptionStatus,
    SubscriptionTier,
)
from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_subscription(
    user_id: uuid.UUID, db: AsyncSession
) -> Subscription | None:
    result = await db.execute(
        select(Subscription).where(Subscription.owner_id == user_id)
    )
    return result.scalar_one_or_none()


async def ensure_free_subscription(
    user_id: uuid.UUID, db: AsyncSession
) -> Subscription:
    """Create a default trial subscription if one does not yet exist.

    New accounts receive a time-boxed trial with unlimited projects.
    """
    existing = await get_subscription(user_id, db)
    if existing is not None:
        apply_trial_expiry(existing)
        return existing
    trial_days = settings.trial_period_days
    sub = Subscription(
        owner_id=user_id,
        tier=SubscriptionTier.FREE.value,
        status=(
            SubscriptionStatus.TRIALING.value
            if trial_days > 0
            else SubscriptionStatus.ACTIVE.value
        ),
        project_limit=(
            None if trial_days > 0 else TIER_PROJECT_LIMIT[SubscriptionTier.FREE]
        ),
        trial_ends_at=(
            datetime.now(UTC) + timedelta(days=trial_days) if trial_days > 0 else None
        ),
    )
    db.add(sub)
    await db.flush()
    return sub


def apply_trial_expiry(sub: Subscription) -> bool:
    """Downgrade a trialing subscription whose trial has ended.

    Mutates ``sub`` in place. Returns True iff a change was applied.
    Only affects subs that are still on the FREE tier — a user who paid
    during their trial keeps their paid tier.
    """
    if sub.status != SubscriptionStatus.TRIALING.value:
        return False
    if sub.trial_ends_at is None:
        return False
    ends_at = sub.trial_ends_at
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=UTC)
    if ends_at > datetime.now(UTC):
        return False
    # Trial expired: drop to free-tier active state.
    if sub.tier == SubscriptionTier.FREE.value:
        sub.status = SubscriptionStatus.ACTIVE.value
        sub.project_limit = TIER_PROJECT_LIMIT[SubscriptionTier.FREE]
    else:
        # Paid tier but still trialing? Just flip status to active.
        sub.status = SubscriptionStatus.ACTIVE.value
    return True


async def count_active_projects(user_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(Project.owner_id == user_id, Project.deleted_at.is_(None))
    )
    return int(result.scalar_one())


async def enforce_project_limit(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Raise HTTP 402 if the user has hit their plan's project limit."""
    sub = await get_subscription(user_id, db)
    if sub is not None:
        apply_trial_expiry(sub)
        limit: int | None = sub.project_limit
    else:
        limit = TIER_PROJECT_LIMIT[SubscriptionTier.FREE]
    if limit is None:
        return
    current = await count_active_projects(user_id, db)
    if current >= limit:
        raise HTTPException(
            status_code=http_status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Project limit reached for your plan ({limit}). "
                "Upgrade your subscription to create more projects."
            ),
        )
