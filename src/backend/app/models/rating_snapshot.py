"""RatingSnapshot — daily aggregate of review ratings per Google location.

We take one snapshot per (location_id, snapshot_date) so we can plot rating
trends over time without re-aggregating the reviews table on every chart load.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RatingSnapshot(Base):
    __tablename__ = "rating_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "location_id", "snapshot_date", name="uq_rating_snapshots_loc_date"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    location_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    average_rating: Mapped[float] = mapped_column(Float, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
