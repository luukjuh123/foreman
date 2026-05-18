"""AI auto-fill planning service — schedule tasks via CPM and historical durations."""

import math
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.planning import TaskScheduleProposal
from app.services.planning.cpm import CpmTask, compute_critical_path

# Fallback duration when estimated_hours == 0 and no historical data exists.
_DEFAULT_FALLBACK_HOURS = 8.0


def _hours_to_days(hours: float, working_hours_per_day: int) -> int:
    """Convert hours to whole working days (minimum 1)."""
    return max(1, math.ceil(hours / working_hours_per_day))


def _add_working_days(start: date, days: int) -> date:
    """Add calendar days (simple — no holiday awareness)."""
    return start + timedelta(days=days - 1)


def compute_schedule(
    tasks: list[CpmTask],
    *,
    start_date: date,
    working_hours_per_day: int = 8,
    historical_hours: dict[str, float] | None = None,
) -> list[TaskScheduleProposal]:
    """Compute a proposed schedule for a list of CpmTask objects.

    For tasks with duration_hours == 0:
    - checks historical_hours dict (keyed by task name) for past averages
    - falls back to _DEFAULT_FALLBACK_HOURS

    Returns a TaskScheduleProposal per task.
    """
    if not tasks:
        return []

    hist = historical_hours or {}

    # Resolve zero-hour tasks before CPM
    for task in tasks:
        if task.duration_hours <= 0:
            hist_val = hist.get(task.name)
            task.duration_hours = hist_val if hist_val else _DEFAULT_FALLBACK_HOURS

    scheduled = compute_critical_path(tasks)
    task_map = {t.id: t for t in scheduled}

    proposals: list[TaskScheduleProposal] = []
    for task in scheduled:
        days = _hours_to_days(task.duration_hours, working_hours_per_day)
        # early_start is in hours offset from project start
        start_offset_days = math.ceil(task.early_start / working_hours_per_day)
        task_start = start_date + timedelta(days=start_offset_days)
        task_end = _add_working_days(task_start, days)

        if task.dependencies:
            dep_names = [task_map[d].name for d in task.dependencies if d in task_map]
            reasoning = (
                f"Scheduled after {'dependency' if len(dep_names) == 1 else 'dependencies'} "
                f"{', '.join(dep_names)}. "
                f"Duration: {task.duration_hours:.0f}h ({days}d)."
            )
        else:
            reasoning = f"No dependencies — starts on project start date. Duration: {task.duration_hours:.0f}h ({days}d)."

        if task.duration_hours == _DEFAULT_FALLBACK_HOURS and not hist.get(task.name):
            reasoning += " Duration estimated using default fallback (no historical data)."

        proposals.append(TaskScheduleProposal(
            task_id=task.id,
            proposed_start_date=task_start,
            proposed_end_date=task_end,
            reasoning=reasoning,
            is_critical=task.is_critical,
        ))

    return proposals


async def get_historical_hours(task_names: list[str], db: AsyncSession) -> dict[str, float]:
    """Return average completed duration per task name pattern across all projects."""
    from app.models.project import Task  # local import to avoid circular

    if not task_names:
        return {}

    result = await db.execute(
        select(Task).where(
            Task.status == "done",
            Task.estimated_hours > 0,
        )
    )
    completed: list[Task] = list(result.scalars().all())

    # Compute average hours for tasks whose names appear in task_names (case-insensitive substring)
    buckets: dict[str, list[float]] = {}
    for name in task_names:
        key = name.lower()
        for ct in completed:
            if key in ct.name.lower():
                buckets.setdefault(name, []).append(ct.estimated_hours)

    return {name: sum(vals) / len(vals) for name, vals in buckets.items() if vals}
