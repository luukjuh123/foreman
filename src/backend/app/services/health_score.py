"""Project health score calculation.

Produces a 0-100 score split across four 25-point components:
- schedule_score:    progress vs planned timeline (25 pts)
- budget_score:      spending relative to budget (25 pts)
- completion_score:  tasks done / total tasks (25 pts)
- overdue_score:     tasks past end_date and not done (25 pts)

Score thresholds: green > 70, amber 40-70, red < 40.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class HealthScoreResult(BaseModel):
    score: int  # 0-100
    rating: str  # "red" | "amber" | "green"
    schedule_score: int  # 0-25
    budget_score: int  # 0-25
    completion_score: int  # 0-25
    overdue_score: int  # 0-25
    details: dict


def calculate_health_score(project: object) -> HealthScoreResult:  # type: ignore[misc]
    """Calculate a 0-100 health score for *project*.

    *project* must expose:
        - ``budget_cents: int``
        - ``start_date: date | None``
        - ``end_date: date | None``
        - ``phases``: iterable of objects with a ``tasks`` iterable, where each
          task exposes ``status: str``, ``end_date: date | None``,
          ``labor_cost_cents: int``.
    """
    today = date.today()

    # --- Collect all tasks ---
    all_tasks = [task for phase in project.phases for task in phase.tasks]  # type: ignore[attr-defined]
    total = len(all_tasks)
    done_count = sum(1 for t in all_tasks if t.status == "done")  # type: ignore[attr-defined]

    # --- Completion component (25 pts) ---
    if total == 0:
        completion_score = 12  # neutral when no tasks
    else:
        completion_score = round(done_count / total * 25)

    # --- Overdue component (25 pts) ---
    overdue_count = sum(
        1
        for t in all_tasks
        if t.status not in ("done",)  # type: ignore[attr-defined]
        and t.end_date is not None  # type: ignore[attr-defined]
        and t.end_date < today  # type: ignore[attr-defined]
    )
    if total == 0:
        overdue_score = 25  # no tasks → no overdue penalty
    else:
        overdue_fraction = overdue_count / total
        overdue_score = round((1.0 - overdue_fraction) * 25)

    # --- Budget component (25 pts) ---
    budget_cents: int = project.budget_cents  # type: ignore[attr-defined]
    spent_cents = sum(t.labor_cost_cents for t in all_tasks)  # type: ignore[attr-defined]
    if budget_cents and budget_cents > 0:
        burn_rate = spent_cents / budget_cents
        if burn_rate <= 1.0:
            budget_score = 25
        else:
            # Each 10% overspend costs 2.5 pts; floor at 0
            budget_score = max(0, round(25 - (burn_rate - 1.0) * 25))
    else:
        burn_rate = 0.0
        budget_score = 25  # no budget set → no penalty

    # --- Schedule component (25 pts) ---
    start_date: date | None = project.start_date  # type: ignore[attr-defined]
    end_date: date | None = project.end_date  # type: ignore[attr-defined]
    if start_date is None or end_date is None or start_date >= end_date:
        # No dates → no schedule penalty
        schedule_score = 25
        planned_progress = 0.0
    else:
        total_days = (end_date - start_date).days
        elapsed_days = max(0, (today - start_date).days)
        planned_progress = min(elapsed_days / total_days, 1.0)
        if total == 0:
            actual_progress = planned_progress  # neutral
        else:
            actual_progress = done_count / total
        variance = actual_progress - planned_progress
        if variance >= 0:
            # On track or ahead
            schedule_score = 25
        else:
            # Behind: each 10% behind costs 2.5 pts; floor at 0
            schedule_score = max(0, round(25 + variance * 25))

    actual_progress_val = done_count / total if total > 0 else 0.0

    # --- Total ---
    total_score = completion_score + overdue_score + budget_score + schedule_score

    if total_score > 70:
        rating = "green"
    elif total_score >= 40:
        rating = "amber"
    else:
        rating = "red"

    return HealthScoreResult(
        score=total_score,
        rating=rating,
        schedule_score=schedule_score,
        budget_score=budget_score,
        completion_score=completion_score,
        overdue_score=overdue_score,
        details={
            "total_tasks": total,
            "done_tasks": done_count,
            "overdue_count": overdue_count,
            "budget_burn_rate": burn_rate,
            "spent_cents": spent_cents,
            "budget_cents": budget_cents,
            "actual_progress": actual_progress_val,
            "planned_progress": planned_progress if start_date and end_date and start_date < end_date else 0.0,
        },
    )
