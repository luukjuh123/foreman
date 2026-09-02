"""Project total-cost composition.

Combines live aggregations (materials, labor) with budget line items
(equipment, overhead, other) into a single breakdown. Materials & labor
budget items are intentionally NOT summed into the total here — they're
provided by the live aggregators to avoid double-counting.

All monetary values are integer euro cents.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.models.material import Budget, BudgetItem
from app.services.financials.labor_cost import (
    DEFAULT_HOURLY_RATE_CENTS,
    LaborCostEstimator,
)
from app.services.financials.material_cost import (
    DefaultStorePriceProvider,
    MaterialCostAggregator,
    StorePriceProvider,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class CostBreakdown:
    materials_cents: int = 0
    labor_cents: int = 0
    equipment_cents: int = 0
    overhead_cents: int = 0
    other_cents: int = 0


@dataclass
class TotalCostReport:
    total_cents: int
    hourly_rate_cents: int
    breakdown: CostBreakdown
    materials_missing_count: int


class TotalCostCalculator:
    """Composes the total project cost from materials, labor, and budget items."""

    def __init__(
        self,
        *,
        price_provider: StorePriceProvider | None = None,
        hourly_rate_cents: int = DEFAULT_HOURLY_RATE_CENTS,
    ) -> None:
        self._materials = MaterialCostAggregator(price_provider or DefaultStorePriceProvider())
        self._labor = LaborCostEstimator(hourly_rate_cents=hourly_rate_cents)

    async def calculate(self, project_id: uuid.UUID, db: AsyncSession) -> TotalCostReport:
        material_report = await self._materials.aggregate(project_id, db)
        labor_report = await self._labor.estimate(project_id, db)

        # Sum equipment / overhead / other budget items via SQL.
        # Materials and labor budget items are skipped — those costs come from the aggregators.
        result = await db.execute(
            select(BudgetItem.category, func.sum(BudgetItem.estimated_cents))
            .join(Budget, BudgetItem.budget_id == Budget.id)
            .where(Budget.project_id == project_id, BudgetItem.category.in_(("equipment", "overhead", "other")))
            .group_by(BudgetItem.category)
        )
        sums = dict(result.all())

        breakdown = CostBreakdown(
            materials_cents=material_report.total_cents,
            labor_cents=labor_report.total_cents,
            equipment_cents=sums.get("equipment", 0),
            overhead_cents=sums.get("overhead", 0),
            other_cents=sums.get("other", 0),
        )
        return TotalCostReport(
            total_cents=sum(vars(breakdown).values()),
            hourly_rate_cents=labor_report.hourly_rate_cents,
            breakdown=breakdown,
            materials_missing_count=len(material_report.missing),
        )
