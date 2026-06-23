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
        total = len(self.tasks)
        done = sum(1 for t in self.tasks if getattr(t, "status", None) == "done")
        overdue = sum(
            1 for t in self.tasks
            if getattr(t, "status", None) != "done"
            and getattr(t, "end_date", None) is not None and t.end_date < self.today
        )
        # Spend is the sum of per-task labor cost (the canonical measure); fall
        # back to a project-level actual_spend_cents only when tasks carry no
        # labor cost data.
        spent_from_tasks = sum(getattr(t, "labor_cost_cents", 0) or 0 for t in self.tasks)
        spent_cents = spent_from_tasks if spent_from_tasks else self.actual_spend_cents
        return HealthFactors(
            total_tasks=total,
            done_tasks=done,
            overdue_count=overdue,
            budget_cents=self.budget_cents,
            spent_cents=spent_cents,
            start_date=self.start_date,
            end_date=self.end_date,
            today=self.today,
        )


def compute_health_score(factors: HealthFactors) -> HealthScoreResult:
    """Compute a HealthScoreResult from pre-computed HealthFactors."""
    total, done_count = factors.total_tasks, factors.done_tasks
    budget_cents, spent_cents = factors.budget_cents, factors.spent_cents
    start_date, end_date, today = factors.start_date, factors.end_date, factors.today

    # Completion (25 pts)
    completion_score = 12 if total == 0 else round(done_count / total * 25)
    # Overdue (25 pts)
    overdue_score = 25 if total == 0 else round((1.0 - factors.overdue_count / total) * 25)
    # Budget (25 pts)
    burn_rate = (spent_cents / budget_cents) if budget_cents and budget_cents > 0 else 0.0
    budget_score = (25 if burn_rate <= 1.0 else max(0, round(25 - (burn_rate - 1.0) * 25))) if budget_cents and budget_cents > 0 else 25

    # Schedule (25 pts)
    if start_date is None or end_date is None or start_date >= end_date:
        schedule_score, planned_progress = 25, 0.0
    else:
        total_days = (end_date - start_date).days
        planned_progress = min(max(0, (today - start_date).days) / total_days, 1.0)
        variance = ((done_count / total) if total > 0 else planned_progress) - planned_progress
        schedule_score = 25 if variance >= 0 else max(0, round(25 + variance * 25))

    total_score = completion_score + overdue_score + budget_score + schedule_score
    return HealthScoreResult(
        score=total_score,
        rating="green" if total_score > 70 else ("amber" if total_score >= 40 else "red"),
        schedule_score=schedule_score, budget_score=budget_score,
        completion_score=completion_score, overdue_score=overdue_score,
        details={
            "total_tasks": total, "done_tasks": done_count,
            "overdue_count": factors.overdue_count, "budget_burn_rate": burn_rate,
            "spent_cents": spent_cents, "budget_cents": budget_cents,
            "actual_progress": done_count / total if total > 0 else 0.0,
            "planned_progress": planned_progress,
        },
    )
