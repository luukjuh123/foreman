"""Report aggregation engine — turn project + phases + tasks into a structured snapshot.

Pure data aggregation. No HTTP concerns, no persistence side-effects. Returns a
JSON-serialisable ``dict`` suitable for handing to a templating layer (PDF, email,
shareable HTML) or storing verbatim in a ``reports.data`` JSON column.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from app.models.project import Phase, Project, Task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


def _date_str(d: date | None) -> str | None:
    return d.isoformat() if d is not None else None


def _task_in_period(task: Task, start: date | None, end: date | None) -> bool:
    """Task counts if its [start_date, end_date] overlaps [start, end].

    Tasks with no dates are always included (they have no temporal anchor).
    """
    if start is None and end is None:
        return True
    t_start = task.start_date
    t_end = task.end_date or task.start_date
    if t_start is None and t_end is None:
        return True
    if start is not None and t_end is not None and t_end < start:
        return False
    return not (end is not None and t_start is not None and t_start > end)


def _serialise_task(task: Task) -> dict[str, Any]:
    return {
        "id": str(task.id),
        "name": task.name,
        "status": task.status,
        "estimated_hours": float(task.estimated_hours or 0.0),
        "labor_cost_cents": int(task.labor_cost_cents or 0),
        "start_date": _date_str(task.start_date),
        "end_date": _date_str(task.end_date),
    }


async def aggregate_project_data(
    db: AsyncSession,
    project_id: uuid.UUID,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    """Aggregate a project into a structured report payload.

    Raises ``LookupError`` if the project does not exist (or is soft-deleted).
    """
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.deleted_at.is_(None))
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise LookupError(f"project {project_id} not found")

    selected_tasks: list[Task] = []
    phases_payload: list[dict[str, Any]] = []
    for phase in sorted(project.phases, key=lambda p: p.order_index):
        phase_tasks = [t for t in phase.tasks if _task_in_period(t, period_start, period_end)]
        selected_tasks.extend(phase_tasks)
        phases_payload.append({
            "id": str(phase.id),
            "name": phase.name,
            "status": phase.status,
            "order_index": phase.order_index,
            "task_count": len(phase_tasks),
            "start_date": _date_str(phase.start_date),
            "end_date": _date_str(phase.end_date),
        })

    completed = [t for t in selected_tasks if t.status == "done"]
    total_hours = sum(float(t.estimated_hours or 0.0) for t in selected_tasks)
    total_cost = sum(int(t.labor_cost_cents or 0) for t in selected_tasks)

    return {
        "project": {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "budget_cents": int(project.budget_cents or 0),
            "start_date": _date_str(project.start_date),
            "end_date": _date_str(project.end_date),
        },
        "period": {
            "start": _date_str(period_start),
            "end": _date_str(period_end),
        },
        "phases": phases_payload,
        "tasks": [_serialise_task(t) for t in selected_tasks],
        "totals": {
            "task_count": len(selected_tasks),
            "completed_task_count": len(completed),
            "estimated_hours": total_hours,
            "labor_cost_cents": total_cost,
        },
    }
