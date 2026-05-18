"""Material cost aggregation.

Sums material costs across all tasks of a project, sourcing prices via a
``StorePriceProvider``. Phase 12 will swap in a live multi-store price
lookup; for now the default provider returns the price persisted on the
``Material`` row (``unit_price_cents``), treating ``0`` as "no price".

All monetary values are integer euro cents.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.material import Material
from app.models.project import Phase, Task


class StorePriceProvider(ABC):
    """Strategy for resolving a material's unit price in euro cents.

    Returning ``None`` means "no price available" — the aggregator will
    list the material under ``missing`` and skip it from the total.
    """

    @abstractmethod
    async def get_price_cents(self, material: Material) -> int | None: ...


class DefaultStorePriceProvider(StorePriceProvider):
    """Reads the price persisted on the Material row.

    A ``unit_price_cents`` of ``0`` is treated as "no price set". Phase 12
    will replace this with a real store-integration lookup.
    """

    async def get_price_cents(self, material: Material) -> int | None:
        return material.unit_price_cents if material.unit_price_cents > 0 else None


@dataclass(frozen=True)
class MaterialLine:
    material_id: uuid.UUID
    name: str
    quantity: float
    unit: str
    unit_price_cents: int | None
    total_cents: int | None


@dataclass
class MaterialCostReport:
    total_cents: int = 0
    items: list[MaterialLine] = field(default_factory=list)
    missing: list[MaterialLine] = field(default_factory=list)


class MaterialCostAggregator:
    """Aggregates material costs for a project using a price provider."""

    def __init__(self, provider: StorePriceProvider) -> None:
        self._provider = provider

    async def aggregate(
        self, project_id: uuid.UUID, db: AsyncSession
    ) -> MaterialCostReport:
        result = await db.execute(
            select(Material)
            .join(Task, Material.task_id == Task.id)
            .join(Phase, Task.phase_id == Phase.id)
            .where(Phase.project_id == project_id)
        )
        materials = list(result.scalars().all())

        report = MaterialCostReport()
        for material in materials:
            price = await self._provider.get_price_cents(material)
            if price is None:
                report.missing.append(
                    MaterialLine(
                        material_id=material.id,
                        name=material.name,
                        quantity=material.quantity,
                        unit=material.unit,
                        unit_price_cents=None,
                        total_cents=None,
                    )
                )
                continue
            line_total = int(material.quantity * price)
            report.items.append(
                MaterialLine(
                    material_id=material.id,
                    name=material.name,
                    quantity=material.quantity,
                    unit=material.unit,
                    unit_price_cents=price,
                    total_cents=line_total,
                )
            )
            report.total_cents += line_total

        return report
