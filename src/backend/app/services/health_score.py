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

    # --- Completion (25 pts) ---
    completion_score = 12 if total == 0 else round(done_count / total * 25)

    # --- Overdue (25 pts) ---
    overdue_count = sum(1 for t in all_tasks if t.status != "done" and t.end_date is not None and t.end_date < today)  # type: ignore[attr-defined]
    overdue_score = 25 if total == 0 else round((1.0 - overdue_count / total) * 25)

    # --- Budget (25 pts) ---
    budget_cents: int = project.budget_cents  # type: ignore[attr-defined]
    spent_cents = sum(t.labor_cost_cents for t in all_tasks)  # type: ignore[attr-defined]
    burn_rate = spent_cents / budget_cents if budget_cents and budget_cents > 0 else 0.0
    budget_score = 25 if burn_rate <= 1.0 else max(0, round(25 - (burn_rate - 1.0) * 25))

    # --- Schedule (25 pts) ---
    start_date: date | None = project.start_date  # type: ignore[attr-defined]
    end_date: date | None = project.end_date  # type: ignore[attr-defined]
    planned_progress = 0.0
    if start_date and end_date and start_date < end_date:
        planned_progress = min(max(0, (today - start_date).days) / (end_date - start_date).days, 1.0)
        actual_progress = planned_progress if total == 0 else done_count / total
        schedule_score = 25 if actual_progress >= planned_progress else max(0, round(25 + (actual_progress - planned_progress) * 25))
    else:
        schedule_score = 25

    total_score = completion_score + overdue_score + budget_score + schedule_score
    rating = "green" if total_score > 70 else ("amber" if total_score >= 40 else "red")

    return HealthScoreResult(
        score=total_score, rating=rating,
        schedule_score=schedule_score, budget_score=budget_score,
        completion_score=completion_score, overdue_score=overdue_score,
        details={
            "total_tasks": total, "done_tasks": done_count, "overdue_count": overdue_count,
            "budget_burn_rate": burn_rate, "spent_cents": spent_cents, "budget_cents": budget_cents,
            "actual_progress": done_count / total if total > 0 else 0.0,
            "planned_progress": planned_progress,
        },
    )
