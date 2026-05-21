"""Report model — persisted generated reports (weekly, completion)."""

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import Boolean, Date, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)

    type: Mapped[str] = mapped_column(String(32), nullable=False)  # "weekly" | "completion"
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    data: Mapped[dict] = mapped_column(JSON, nullable=False)

    share_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, nullable=True
    )
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
