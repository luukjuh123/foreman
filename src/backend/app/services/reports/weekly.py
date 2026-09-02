"""Weekly project report generator.

Builds on ``aggregate_project_data`` to produce a structured "what we did this
week, what's planned next week" snapshot with hours and labor costs rolled up
per phase. Pure data — persistence, PDF, and email layers compose on top.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.models.process import Process
from app.models.process_photo import ProcessPhoto
from app.models.project import Phase, Project, Task
from app.services.reports.engine import _task_in_period, aggregate_project_data
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

WEEK_LENGTH_DAYS = 7


def _ensure_monday(week_start: date) -> None:
    # Python: Monday == 0
    if week_start.weekday() != 0:
        raise ValueError(f"week_start must be a Monday; got {week_start.isoformat()} (weekday={week_start.weekday()})")


def _photo_to_dict(photo: ProcessPhoto, process_label: str | None) -> dict[str, Any]:
    return {
        "id": str(photo.id),
        "image_url": photo.image_url,
        "completion_pct": photo.completion_pct,
        "process_label": process_label,
        "recognized_process_id": str(photo.recognized_process_id) if photo.recognized_process_id else None,
        "reasoning": photo.reasoning,
        "created_at": photo.created_at.isoformat() if photo.created_at else None,
    }


async def _fetch_photos_for_period(
    db: AsyncSession,
    project_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Fetch photos within [period_start, period_end]; return (flat_list, by_phase_list)."""
    start_dt = datetime(period_start.year, period_start.month, period_start.day, tzinfo=timezone.utc)
    end_dt = datetime(period_end.year, period_end.month, period_end.day, 23, 59, 59, tzinfo=timezone.utc)

    result = await db.execute(
        select(ProcessPhoto, Process.name)
        .join(Process, ProcessPhoto.recognized_process_id == Process.id, isouter=True)
        .where(
            ProcessPhoto.project_id == project_id,
            ProcessPhoto.created_at >= start_dt,
            ProcessPhoto.created_at <= end_dt,
        )
        .order_by(ProcessPhoto.created_at)
    )
    rows = result.all()

    flat: list[dict[str, Any]] = []
    by_phase_map: dict[str, list[dict[str, Any]]] = {}

    for photo, process_name in rows:
        photo_dict = _photo_to_dict(photo, process_name)
        flat.append(photo_dict)
        label = process_name or "Onbekend"
        by_phase_map.setdefault(label, []).append(photo_dict)

    by_phase: list[dict[str, Any]] = [
        {"process_label": label, "photos": photos}
        for label, photos in by_phase_map.items()
    ]

    return flat, by_phase


async def generate_weekly_report(
    db: AsyncSession,
    project_id: uuid.UUID,
    week_start: date,
    *,
    include_photos: bool = True,
) -> dict[str, Any]:
    """Generate a weekly report for ``project_id`` covering ``[week_start, +6]``.

    Args:
        include_photos: When True (default), fetch and embed site photos taken
            during the report period, grouped by process label.

    Raises:
        ValueError: ``week_start`` is not a Monday.
        LookupError: project does not exist.
    """
    _ensure_monday(week_start)
    week_end = week_start + timedelta(days=WEEK_LENGTH_DAYS - 1)
    next_week_start = week_start + timedelta(days=WEEK_LENGTH_DAYS)
    next_week_end = next_week_start + timedelta(days=WEEK_LENGTH_DAYS - 1)

    base = await aggregate_project_data(db, project_id, week_start, week_end)

    # Reload with phases+tasks for the next-week and per-phase rollups.
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.deleted_at.is_(None))
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    project = result.scalar_one()  # already validated by aggregate_project_data

    completed_this_week: list[dict[str, Any]] = []
    hours_by_phase_map: dict[uuid.UUID, dict[str, Any]] = {}
    next_week_plan: list[dict[str, Any]] = []

    for phase in sorted(project.phases, key=lambda p: p.order_index):
        this_week_tasks: list[Task] = [t for t in phase.tasks if _task_in_period(t, week_start, week_end)]
        for t in this_week_tasks:
            if t.status == "done":
                completed_this_week.append(
                    {
                        "id": str(t.id),
                        "name": t.name,
                        "phase_name": phase.name,
                        "estimated_hours": float(t.estimated_hours or 0.0),
                        "labor_cost_cents": int(t.labor_cost_cents or 0),
                    }
                )
        if this_week_tasks:
            hours_by_phase_map[phase.id] = {
                "phase_id": str(phase.id),
                "phase_name": phase.name,
                "task_count": len(this_week_tasks),
                "estimated_hours": sum(float(t.estimated_hours or 0.0) for t in this_week_tasks),
                "labor_cost_cents": sum(int(t.labor_cost_cents or 0) for t in this_week_tasks),
            }
        for t in phase.tasks:
            if _task_in_period(t, next_week_start, next_week_end):
                next_week_plan.append(
                    {
                        "id": str(t.id),
                        "name": t.name,
                        "phase_name": phase.name,
                        "status": t.status,
                        "estimated_hours": float(t.estimated_hours or 0.0),
                        "labor_cost_cents": int(t.labor_cost_cents or 0),
                        "start_date": t.start_date.isoformat() if t.start_date else None,
                        "end_date": t.end_date.isoformat() if t.end_date else None,
                    }
                )

    if include_photos:
        photos_flat, photos_by_phase = await _fetch_photos_for_period(
            db, project_id, week_start, week_end
        )
    else:
        photos_flat, photos_by_phase = [], []

    return {
        "type": "weekly",
        "project": base["project"],
        "period": {
            "start": week_start.isoformat(),
            "end": week_end.isoformat(),
        },
        "next_week": {
            "start": next_week_start.isoformat(),
            "end": next_week_end.isoformat(),
        },
        "phases": base["phases"],
        "tasks": base["tasks"],
        "totals": base["totals"],
        "completed_this_week": completed_this_week,
        "hours_by_phase": list(hours_by_phase_map.values()),
        "next_week_plan": next_week_plan,
        "photos": photos_flat,
        "photos_by_phase": photos_by_phase,
    }
