"""Equipment / tool tracking models — Phase 19.

Tracks company tools and machinery: registration, project assignments,
usage history, and maintenance schedule.
"""

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Equipment(Base):
    """A company-owned tool, machine, or vehicle."""

    __tablename__ = "equipment"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # category: tool | machinery | vehicle | scaffold | other
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="tool")
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Purchase price in euro cents
    purchase_price_cents: Mapped[int] = mapped_column(nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # available | in_use | maintenance | retired
    status: Mapped[str] = mapped_column(String(50), default="available", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    assignments: Mapped[list["EquipmentAssignment"]] = relationship(
        back_populates="equipment", cascade="all, delete-orphan"
    )
    maintenance_records: Mapped[list["EquipmentMaintenance"]] = relationship(
        back_populates="equipment", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("purchase_price_cents >= 0", name="ck_equipment_price_non_negative"),
        CheckConstraint(
            "status IN ('available', 'in_use', 'maintenance', 'retired')",
            name="ck_equipment_status",
        ),
    )


class EquipmentAssignment(Base):
    """Assignment of a piece of equipment to a project for a period."""

    __tablename__ = "equipment_assignments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    equipment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    assigned_date: Mapped[date] = mapped_column(Date, nullable=False)
    returned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    equipment: Mapped["Equipment"] = relationship(back_populates="assignments")


class EquipmentMaintenance(Base):
    """A maintenance record for a piece of equipment."""

    __tablename__ = "equipment_maintenance"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    equipment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True
    )
    maintenance_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Cost in euro cents
    cost_cents: Mapped[int] = mapped_column(nullable=False, default=0)
    # Optional: when is the next maintenance due?
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    performed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    equipment: Mapped["Equipment"] = relationship(back_populates="maintenance_records")

    __table_args__ = (CheckConstraint("cost_cents >= 0", name="ck_equip_maint_cost_non_negative"),)
