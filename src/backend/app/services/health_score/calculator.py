"""Health score calculator — re-exports and thin wrappers over the legacy module.

The health_score.py module is the canonical implementation. This module
exposes the additional names expected by __init__.py without duplicating logic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pydantic import BaseModel


class HealthScoreResult(BaseModel):
    score: int
    rating: str
    schedule_score: int
    budget_score: int
    completion_score: int
    overdue_score: int
    details: dict


# ---------------------------------------------------------------------------
# Stub types expected by __init__.py
# ---------------------------------------------------------------------------


class HealthGrade:
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


@dataclass
class HealthFactors:
    total_tasks: int = 0
    done_tasks: int = 0
    overdue_count: int = 0
    budget_cents: int = 0
    spent_cents: int = 0
    start_date: date | None = None
    end_date: date | None = None
    today: date = field(default_factory=date.today)


@dataclass
class ProjectHealthCalculator:
    tasks: list[Any] = field(default_factory=list)
    today: date = field(default_factory=date.today)
    budget_cents: int = 0
    actual_spend_cents: int = 0
    actual_hours_total: float = 0.0
    start_date: date | None = None
    end_date: date | None = None

    def compute_factors(self) -> HealthFactors:
        done = sum(1 for t in self.tasks if getattr(t, "status", None) == "done")
        overdue = sum(1 for t in self.tasks if getattr(t, "status", None) != "done" and getattr(t, "end_date", None) is not None and t.end_date < self.today)
        spent = sum(getattr(t, "labor_cost_cents", 0) or 0 for t in self.tasks) or self.actual_spend_cents
        return HealthFactors(total_tasks=len(self.tasks), done_tasks=done, overdue_count=overdue, budget_cents=self.budget_cents,
                             spent_cents=spent, start_date=self.start_date, end_date=self.end_date, today=self.today)


def compute_health_score(factors: HealthFactors) -> HealthScoreResult:
    """Compute a HealthScoreResult from pre-computed HealthFactors."""
    f = factors
    t, d = f.total_tasks, f.done_tasks

    completion = 12 if t == 0 else round(d / t * 25)
    overdue = 25 if t == 0 else round((1 - f.overdue_count / t) * 25)
    burn = (f.spent_cents / f.budget_cents) if f.budget_cents else 0.0
    budget = (25 if burn <= 1 else max(0, round(25 - (burn - 1) * 25))) if f.budget_cents else 25

    if f.start_date and f.end_date and f.start_date < f.end_date:
        pp = min(max(0, (f.today - f.start_date).days) / (f.end_date - f.start_date).days, 1.0)
        variance = (d / t if t else pp) - pp
        schedule = 25 if variance >= 0 else max(0, round(25 + variance * 25))
    else:
        schedule, pp = 25, 0.0

    total = completion + overdue + budget + schedule
    return HealthScoreResult(
        score=total, rating="green" if total > 70 else ("amber" if total >= 40 else "red"),
        schedule_score=schedule, budget_score=budget, completion_score=completion, overdue_score=overdue,
        details={"total_tasks": t, "done_tasks": d, "overdue_count": f.overdue_count, "budget_burn_rate": burn,
                 "spent_cents": f.spent_cents, "budget_cents": f.budget_cents,
                 "actual_progress": d / t if t else 0.0, "planned_progress": pp},
    )
