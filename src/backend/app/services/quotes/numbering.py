"""Yearly per-owner quote numbering counter."""

from __future__ import annotations

import uuid

from app.models.quote import QuoteCounter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def format_quote_number(year: int, number: int) -> str:
    """Format as OFF-YYYY-NNNN (zero-padded to 4 digits)."""
    return f"OFF-{year:04d}-{number:04d}"


async def allocate_quote_number(db: AsyncSession, *, owner_id: uuid.UUID, year: int) -> str:
    """Allocate the next quote number for the given owner+year.

    Increments the persisted counter within the current session and returns
    the formatted quote number string.
    """
    result = await db.execute(
        select(QuoteCounter).where(QuoteCounter.owner_id == owner_id, QuoteCounter.year == year)
    )
    counter = result.scalar_one_or_none()
    if counter is None:
        counter = QuoteCounter(owner_id=owner_id, year=year, last_number=0)
        db.add(counter)
        await db.flush()

    counter.last_number = counter.last_number + 1
    await db.flush()
    return format_quote_number(year, counter.last_number)
