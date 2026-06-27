"""Shared router dependencies — generic helpers to reduce boilerplate."""

from __future__ import annotations

import uuid
from typing import Any

from app.models.staff import Staff
from app.models.user import User
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_or_404(
    db: AsyncSession,
    model: type,
    *filters: Any,
    detail: str | None = None,
    options: Any | None = None,
) -> Any:
    """Fetch a single row matching *filters* or raise 404.

    Replaces the 4-6 line select→scalar→if-None→raise pattern.
    """
    stmt = select(model).where(*filters)
    if options is not None:
        stmt = stmt.options(options) if not isinstance(options, (list, tuple)) else stmt.options(*options)
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail or f"{model.__name__} not found",
        )
    return obj


def apply_updates(obj: Any, body: Any, **overrides: Any) -> None:
    """Apply Pydantic partial-update fields to an ORM object.

    Replaces the ``for field, value in body.model_dump(exclude_unset=True).items(): setattr(...)`` pattern.
    """
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, overrides.get(k, v))


async def count_query(db: AsyncSession, query: Any) -> int:
    """Return the row count for an arbitrary query via a subquery count.

    Replaces ``(await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()``.
    """
    return (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()


# Legacy helper kept for backward compatibility (loans.py imports it).
async def get_owned_staff_or_404(staff_id: uuid.UUID, user: User, db: AsyncSession) -> Staff:
    return await get_or_404(
        db, Staff,
        Staff.id == staff_id, Staff.owner_id == user.id, Staff.deleted_at.is_(None),
        detail="Staff not found",
    )
