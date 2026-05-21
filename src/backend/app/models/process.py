"""Process templates and project_processes association.

A `Process` is a reusable construction process template (e.g. "stucen",
"tegelen", "schilderen"). Projects link to processes via the many-to-many
`project_processes` association table.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Process(Base):
    """Reusable process template — globally addressable by slug."""

    __tablename__ = "processes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # SI-only unit string, e.g. "m2", "m", "kg". Free-form; estimator validates.
    unit: Mapped[str] = mapped_column(String(20), default="m2", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project_links: Mapped[list[ProjectProcess]] = relationship(back_populates="process", cascade="all, delete-orphan")


class ProjectProcess(Base):
    """M2M association between Project and Process.

    Each row is the instance of a process being applied within a project.
    Time tracking entries and photos hang off `project_process_id`.
    """

    __tablename__ = "project_processes"
    __table_args__ = (UniqueConstraint("project_id", "process_id", name="uq_project_process"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    process_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    process: Mapped[Process] = relationship(back_populates="project_links")
