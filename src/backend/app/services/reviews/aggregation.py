"""Review rating aggregation — daily snapshots and trend retrieval."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rating_snapshot import RatingSnapshot
from app.models.review import Review


@dataclass(frozen=True)
class SnapshotResult:
    location_id: str
    snapshot_date: date
    average_rating: float
    review_count: int


async def take_snapshot(
    db: AsyncSession, location_id: str, *, today: date | None = None
) -> SnapshotResult:
    """Compute today's rating average for a location and upsert the snapshot.

    Re-running on the same day overwrites the existing row (so the latest call
    of the day wins). This is intentional: it lets a daily cron + a manual
    "sync now" coexist without duplicating rows.
    """
    today = today or date.today()
    stmt = select(
        func.coalesce(func.avg(Review.rating), 0.0),
        func.count(Review.id),
    ).where(Review.location_id == location_id)
    row = (await db.execute(stmt)).one()
    avg = float(row[0] or 0.0)
    count = int(row[1] or 0)

    # Upsert (portable two-step: try update, fallback to insert).
    existing = await db.execute(
        select(RatingSnapshot).where(
            RatingSnapshot.location_id == location_id,
            RatingSnapshot.snapshot_date == today,
        )
    )
    obj = existing.scalar_one_or_none()
    if obj is None:
        obj = RatingSnapshot(
            location_id=location_id,
            snapshot_date=today,
            average_rating=avg,
            review_count=count,
        )
        db.add(obj)
    else:
        obj.average_rating = avg
        obj.review_count = count
        db.add(obj)
    await db.commit()
    return SnapshotResult(location_id, today, avg, count)


async def get_trend(
    db: AsyncSession, location_id: str, *, days: int = 30
) -> list[SnapshotResult]:
    """Return snapshots for the last `days` days, oldest first."""
    if days <= 0:
        return []
    cutoff = date.today() - timedelta(days=days - 1)
    stmt = (
        select(RatingSnapshot)
        .where(
            RatingSnapshot.location_id == location_id,
            RatingSnapshot.snapshot_date >= cutoff,
        )
        .order_by(RatingSnapshot.snapshot_date.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        SnapshotResult(
            location_id=r.location_id,
            snapshot_date=r.snapshot_date,
            average_rating=r.average_rating,
            review_count=r.review_count,
        )
        for r in rows
    ]
