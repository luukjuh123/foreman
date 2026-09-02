"""Project health score calculator.

Computes a 0-100 health score for a project by combining four factors:

    Factor                  Weight  Description
    ─────────────────────   ──────  ──────────────────────────────────────────
    schedule_variance        30%    % of tasks that are not overdue
    budget_burn_rate         30%    actual spend / budget (inverted; 0 = bad)
    time_accuracy            20%    estimated hours accuracy vs actuals
    task_completion_rate     20%    completed tasks / total tasks

Grades:
    green  ≥ 70
    amber  50 – 69
    red    < 50

All inputs are plain Python; no database access in this module.
DB queries are the responsibility of the caller (the router).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from math import floor
from typing import Protocol

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class HealthGrade(StrEnum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


@dataclass(frozen=True)
class HealthFactors:
    """Normalised [0, 1] inputs for each scoring dimension.

    - schedule_variance: 1.0 = all tasks on time; 0.0 = all tasks overdue
    - budget_burn_rate:  actual_spend / budget  (0.5 = 50% spent, 1.5 = 50% over)
    - time_accuracy:     1.0 = actuals match estimates; 0.0 = wildly over/under
    - task_completion_rate: 1.0 = all done; 0.0 = none done
    """

    schedule_variance: float
    budget_burn_rate: float
    time_accuracy: float
    task_completion_rate: float


@dataclass(frozen=True)
class HealthScoreResult:
    score: int  # 0-100
    grade: HealthGrade
    factors: HealthFactors


# ---------------------------------------------------------------------------
# Weights (must sum to 1.0)
# ---------------------------------------------------------------------------

_W_SCHEDULE = 0.30
_W_BUDGET = 0.30
_W_TIME = 0.20
_W_COMPLETION = 0.20


# ---------------------------------------------------------------------------
# Pure scoring function
# ---------------------------------------------------------------------------


def compute_health_score(factors: HealthFactors) -> HealthScoreResult:
    """Combine factors into a 0-100 integer score.

    Budget burn rate is a cost ratio (actual/budget), so we invert it:
      - 0.0 → spent nothing → full points (but unusual; treated as neutral 0.5)
      - 1.0 → exactly on budget → 0 budget points (all money gone)
      - 2.0+ → 200% over budget → capped at 0

    We use: budget_score = max(0, 1 - burn_rate / 2)
    This maps:
      0.5 → 0.75 (good: half spent)
      1.0 → 0.50 (neutral: fully spent)
      2.0 → 0.00 (bad: 200% over)
    """
    burn = min(factors.budget_burn_rate, 2.0)  # cap at 200% overrun
    budget_score = max(0.0, 1.0 - burn / 2.0)

    raw = (
        _W_SCHEDULE * max(0.0, min(1.0, factors.schedule_variance))
        + _W_BUDGET * budget_score
        + _W_TIME * max(0.0, min(1.0, factors.time_accuracy))
        + _W_COMPLETION * max(0.0, min(1.0, factors.task_completion_rate))
    )

    score = floor(raw * 100)
    score = max(0, min(100, score))

    if score >= 70:
        grade = HealthGrade.GREEN
    elif score >= 50:
        grade = HealthGrade.AMBER
    else:
        grade = HealthGrade.RED

    return HealthScoreResult(score=score, grade=grade, factors=factors)


# ---------------------------------------------------------------------------
# Task protocol — matches SQLAlchemy Task ORM without importing it
# ---------------------------------------------------------------------------


class TaskLike(Protocol):
    status: str
    estimated_hours: float
    end_date: object  # datetime.date | None


# ---------------------------------------------------------------------------
# Calculator — derives HealthFactors from project data
# ---------------------------------------------------------------------------


class ProjectHealthCalculator:
    """Derives HealthFactors from project data passed by the caller.

    Args:
        tasks:              list of task-like objects (status, estimated_hours, end_date)
        today:              reference date for overdue calculation
        budget_cents:       total project budget in euro cents (0 = unset)
        actual_spend_cents: actual total spend in euro cents
        actual_hours_total: total actual hours logged (from time entries)
    """

    def __init__(
        self,
        *,
        tasks: list,
        today,
        budget_cents: int,
        actual_spend_cents: int,
        actual_hours_total: float,
    ) -> None:
        self._tasks = tasks
        self._today = today
        self._budget_cents = budget_cents
        self._actual_spend_cents = actual_spend_cents
        self._actual_hours_total = actual_hours_total

    def compute_factors(self) -> HealthFactors:
        return HealthFactors(
            schedule_variance=self._schedule_variance(),
            budget_burn_rate=self._budget_burn_rate(),
            time_accuracy=self._time_accuracy(),
            task_completion_rate=self._task_completion_rate(),
        )

    # -- factor implementations ----------------------------------------------

    def _schedule_variance(self) -> float:
        tasks = self._tasks
        if not tasks:
            return 1.0
        # Tasks with no end_date are considered on-time (can't be overdue)
        overdue = sum(
            1 for t in tasks if t.end_date is not None and t.status not in ("done",) and t.end_date < self._today
        )
        return 1.0 - overdue / len(tasks)

    def _budget_burn_rate(self) -> float:
        if not self._budget_cents:
            # No budget set — return neutral value (half-spent equivalent)
            return 0.5
        return self._actual_spend_cents / self._budget_cents

    def _time_accuracy(self) -> float:
        total_estimated = sum(t.estimated_hours for t in self._tasks)
        if total_estimated <= 0:
            return 1.0  # no estimates → can't penalise
        ratio = self._actual_hours_total / total_estimated
        if ratio <= 0:
            return 1.0
        # Perfect accuracy at ratio=1; degrade as ratio increases
        return min(1.0, 1.0 / ratio)

    def _task_completion_rate(self) -> float:
        tasks = self._tasks
        if not tasks:
            return 1.0
        done = sum(1 for t in tasks if t.status == "done")
        return done / len(tasks)
