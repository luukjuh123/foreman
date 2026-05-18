"""Yearly per-owner invoice numbering counter."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import InvoiceCounter


def format_invoice_number(year: int, number: int) -> str:
    """Format as YYYY-NNNN (zero-padded to 4 digits)."""
    return f"{year:04d}-{number:04d}"


async def allocate_invoice_number(
    db: AsyncSession, *, owner_id: uuid.UUID, year: int
) -> str:
    """Allocate the next invoice number for the given owner+year.

    Increments the persisted counter within the current session and returns
    the formatted invoice number string.
    """

    result = await db.execute(
        select(InvoiceCounter).where(
            InvoiceCounter.owner_id == owner_id, InvoiceCounter.year == year
        )
    )
    counter = result.scalar_one_or_none()
    if counter is None:
        counter = InvoiceCounter(owner_id=owner_id, year=year, last_number=0)
        db.add(counter)
        await db.flush()

    counter.last_number = counter.last_number + 1
    await db.flush()
    return format_invoice_number(year, counter.last_number)
