"""Material, Budget, and BudgetItem models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Categories that drive the project total-cost breakdown.
BUDGET_ITEM_CATEGORIES = ("materials", "labor", "equipment", "overhead", "other")


class Material(Base):
    """A material line item on a project task."""

    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Quantity in SI units (m, m², m³, kg, L)
    quantity: Mapped[float] = mapped_column(default=0.0)
    unit: Mapped[str] = mapped_column(String(20), default="piece")  # piece|m|m2|m3|kg|L
    # Unit price in euro cents
    unit_price_cents: Mapped[int] = mapped_column(default=0)
    # Optional: which store was selected for this material
    preferred_store: Mapped[str | None] = mapped_column(String(100), nullable=True)
    store_product_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def total_price_cents(self) -> int:
        return int(self.quantity * self.unit_price_cents)


class Budget(Base):
    """Project-level budget tracking."""

    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, unique=True, index=True
    )
    # All values in euro cents
    total_budget_cents: Mapped[int] = mapped_column(default=0)
    contingency_pct: Mapped[float] = mapped_column(default=10.0)  # percentage
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["BudgetItem"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan"
    )


class BudgetItem(Base):
    """A single line item attached to a project's budget.

    Categories track the breakdown used by the financial dashboard:
    materials, labor, equipment, overhead, other.
    """

    __tablename__ = "budget_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    budget_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("budgets.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_cents: Mapped[int] = mapped_column(default=0)
    actual_cents: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    budget: Mapped["Budget"] = relationship(back_populates="items")
