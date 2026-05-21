"""Project completion report — full summary including timeline, budget variance, phase rollup.

Designed to be rendered as the customer-facing closeout document at the end of
a project. Pure data — composes on top of ``aggregate_project_data``.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.models.project import Phase, Project
from app.services.reports.engine import aggregate_project_data
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


def _duration_days(start: str | None, end: str | None) -> int | None:
    """Inclusive day count between two ISO date strings; None if either missing."""
    if start is None or end is None:
        return None
    from datetime import date as _date

    s = _date.fromisoformat(start)
    e = _date.fromisoformat(end)
    return (e - s).days + 1


async def generate_completion_report(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> dict[str, Any]:
    """Generate a full project completion report.

    Raises ``LookupError`` if the project does not exist.
    """
    base = await aggregate_project_data(db, project_id)

    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.deleted_at.is_(None))
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    project = result.scalar_one()

    # Timeline: planned (project.start_date/end_date) vs actual (min/max task dates).
    task_starts = [t.start_date for ph in project.phases for t in ph.tasks if t.start_date is not None]
    task_ends = [
        t.end_date or t.start_date
        for ph in project.phases
        for t in ph.tasks
        if (t.end_date or t.start_date) is not None
    ]
    actual_start = min(task_starts).isoformat() if task_starts else None
    actual_end = max(task_ends).isoformat() if task_ends else None
    planned_start = base["project"]["start_date"]
    planned_end = base["project"]["end_date"]

    timeline = {
        "planned_start": planned_start,
        "planned_end": planned_end,
        "planned_duration_days": _duration_days(planned_start, planned_end),
        "actual_start": actual_start,
        "actual_end": actual_end,
        "actual_duration_days": _duration_days(actual_start, actual_end),
    }

    # Costs vs budget
    budget = int(base["project"]["budget_cents"] or 0)
    actual = int(base["totals"]["labor_cost_cents"])
    variance_cents = budget - actual
    if budget > 0:
        variance_pct: float | None = (actual - budget) / budget * 100
    else:
        variance_pct = None

    costs_vs_budget = {
        "budget_cents": budget,
        "actual_cost_cents": actual,
        "variance_cents": variance_cents,
        "variance_pct": variance_pct,
        "over_budget": actual > budget if budget > 0 else False,
    }

    # Phase-level rollup
    phase_summary: list[dict[str, Any]] = []
    for phase in sorted(project.phases, key=lambda p: p.order_index):
        phase_summary.append(
            {
                "phase_id": str(phase.id),
                "phase_name": phase.name,
                "status": phase.status,
                "task_count": len(phase.tasks),
                "completed_task_count": sum(1 for t in phase.tasks if t.status == "done"),
                "estimated_hours": sum(float(t.estimated_hours or 0.0) for t in phase.tasks),
                "actual_cost_cents": sum(int(t.labor_cost_cents or 0) for t in phase.tasks),
            }
        )

    return {
        "type": "completion",
        "project": base["project"],
        "phases": base["phases"],
        "tasks": base["tasks"],
        "totals": base["totals"],
        "timeline": timeline,
        "costs_vs_budget": costs_vs_budget,
        "phase_summary": phase_summary,
        # Free-text lessons & photos aren't modelled yet — slots reserved.
        "lessons_learned": [],
        "photos": [],
    }
