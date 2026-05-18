"""Labor cost estimation.

Sums ``estimated_hours`` across all tasks in a project and multiplies by
an hourly rate (euro cents). The rate is configurable per-call so the
financial dashboard can model "what-if" scenarios without mutating any
task's persisted ``labor_cost_cents``.

All monetary values are integer euro cents.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Phase, Task

# Conservative Dutch construction-labor default: €50/hour fully loaded.
DEFAULT_HOURLY_RATE_CENTS: int = 5000


@dataclass(frozen=True)
class TaskLaborLine:
    task_id: uuid.UUID
    name: str
    estimated_hours: float
    cost_cents: int


@dataclass
class LaborCostReport:
    hourly_rate_cents: int
    total_hours: float = 0.0
    total_cents: int = 0
    tasks: list[TaskLaborLine] = field(default_factory=list)


class LaborCostEstimator:
    """Estimates labor cost = sum(estimated_hours) × hourly_rate_cents."""

    def __init__(self, hourly_rate_cents: int = DEFAULT_HOURLY_RATE_CENTS) -> None:
        if hourly_rate_cents < 0:
            msg = "hourly_rate_cents must be >= 0"
            raise ValueError(msg)
        self._rate = hourly_rate_cents

    @property
    def hourly_rate_cents(self) -> int:
        return self._rate

    async def estimate(
        self, project_id: uuid.UUID, db: AsyncSession
    ) -> LaborCostReport:
        result = await db.execute(
            select(Task)
            .join(Phase, Task.phase_id == Phase.id)
            .where(Phase.project_id == project_id)
        )
        tasks = list(result.scalars().all())

        report = LaborCostReport(hourly_rate_cents=self._rate)
        for task in tasks:
            hours = float(task.estimated_hours or 0.0)
            cost = int(hours * self._rate)
            report.tasks.append(
                TaskLaborLine(
                    task_id=task.id,
                    name=task.name,
                    estimated_hours=hours,
                    cost_cents=cost,
                )
            )
            report.total_hours += hours
            report.total_cents += cost

        return report
