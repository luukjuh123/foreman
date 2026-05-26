"""Yearly per-owner offerte numbering counter."""

from __future__ import annotations

import uuid

from app.models.offerte import OfferteCounter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def format_offerte_number(year: int, seq: int) -> str:
    """Format as OFF{year}-{seq:04d}."""
    return f"OFF{year}-{seq:04d}"


async def next_offerte_number(db: AsyncSession, *, owner_id: uuid.UUID, year: int) -> str:
    """Allocate the next offerte number for the given owner+year."""
    result = await db.execute(
        select(OfferteCounter).where(
            OfferteCounter.owner_id == owner_id,
            OfferteCounter.year == year,
        )
    )
    counter = result.scalar_one_or_none()
    if counter is None:
        counter = OfferteCounter(owner_id=owner_id, year=year, last_number=0)
        db.add(counter)
        await db.flush()

    counter.last_number = counter.last_number + 1
    await db.flush()
    return format_offerte_number(year, counter.last_number)
