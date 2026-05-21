"""Incident / damage report model."""

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # "low"|"medium"|"high"|"critical"
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    # "injury"|"property_damage"|"near_miss"|"environmental"|"theft"|"other"
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # "reported"|"investigating"|"resolved"|"closed"
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="reported")

    incident_date: Mapped[date] = mapped_column(Date, nullable=False)
    incident_time: Mapped[str | None] = mapped_column(String(5), nullable=True)   # "HH:MM"
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reported_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    witnesses: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)

    damage_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
