"""Subscription helpers — provisioning and project-limit enforcement."""

import uuid

from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.subscription import (
    TIER_PROJECT_LIMIT,
    Subscription,
    SubscriptionStatus,
    SubscriptionTier,
)


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
    """Create a default free-tier subscription if one does not yet exist."""
    existing = await get_subscription(user_id, db)
    if existing is not None:
        return existing
    sub = Subscription(
        owner_id=user_id,
        tier=SubscriptionTier.FREE.value,
        status=SubscriptionStatus.ACTIVE.value,
        project_limit=TIER_PROJECT_LIMIT[SubscriptionTier.FREE],
    )
    db.add(sub)
    await db.flush()
    return sub


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
    if sub is None:
        limit: int | None = TIER_PROJECT_LIMIT[SubscriptionTier.FREE]
    else:
        limit = sub.project_limit
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
