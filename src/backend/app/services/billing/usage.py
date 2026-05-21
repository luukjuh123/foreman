"""Usage metering — per-account counters for projects, users, storage."""

import uuid

from app.models.usage import UsageCounter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_or_create_counter(
    user_id: uuid.UUID, db: AsyncSession
) -> UsageCounter:
    result = await db.execute(
        select(UsageCounter).where(UsageCounter.owner_id == user_id)
    )
    counter = result.scalar_one_or_none()
    if counter is not None:
        return counter
    counter = UsageCounter(owner_id=user_id, project_count=0, user_count=1, storage_bytes=0)
    db.add(counter)
    await db.flush()
    return counter


async def increment_projects(user_id: uuid.UUID, db: AsyncSession, delta: int = 1) -> None:
    counter = await get_or_create_counter(user_id, db)
    counter.project_count = max(0, counter.project_count + delta)
    await db.flush()


async def add_storage_bytes(
    user_id: uuid.UUID, delta: int, db: AsyncSession
) -> None:
    counter = await get_or_create_counter(user_id, db)
    counter.storage_bytes = max(0, counter.storage_bytes + delta)
    await db.flush()
