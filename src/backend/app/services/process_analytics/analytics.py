"""Historical analytics for process durations.

Aggregates completed ``ProcessTimeEntry`` rows across **all** projects to
compute the average duration per process. Feeds the AI planning engine: when
estimating future schedules it uses these averages for processes that have
historical data.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.process import Process, ProjectProcess
from app.models.time_entry import ProcessTimeEntry


@dataclass(frozen=True)
class ProcessStats:
    process_id: uuid.UUID
    process_slug: str
    process_name: str
    entry_count: int
    project_count: int
    total_seconds: int
    avg_seconds: float | None  # None when entry_count == 0


async def stats_for_process(
    process_id: uuid.UUID, db: AsyncSession
) -> ProcessStats | None:
    """Compute stats for a single process. Returns None if the process is unknown."""
    proc = (await db.execute(
        select(Process).where(Process.id == process_id, Process.deleted_at.is_(None))
    )).scalar_one_or_none()
    if proc is None:
        return None

    result = await db.execute(
        select(
            func.count(ProcessTimeEntry.id),
            func.coalesce(func.sum(ProcessTimeEntry.duration_seconds), 0),
            func.count(func.distinct(ProjectProcess.project_id)),
        )
        .select_from(ProcessTimeEntry)
        .join(ProjectProcess, ProcessTimeEntry.project_process_id == ProjectProcess.id)
        .where(
            ProjectProcess.process_id == process_id,
            ProcessTimeEntry.duration_seconds.is_not(None),
        )
    )
    entry_count, total_seconds, project_count = result.one()
    avg = (total_seconds / entry_count) if entry_count else None
    return ProcessStats(
        process_id=proc.id,
        process_slug=proc.slug,
        process_name=proc.name,
        entry_count=int(entry_count),
        project_count=int(project_count),
        total_seconds=int(total_seconds),
        avg_seconds=avg,
    )


async def stats_all_processes(db: AsyncSession) -> list[ProcessStats]:
    """Stats for every non-deleted process, sorted by slug.

    Processes without completed entries are returned with ``entry_count = 0``
    and ``avg_seconds = None`` so the AI planner can still see them.
    """
    procs = (await db.execute(
        select(Process).where(Process.deleted_at.is_(None)).order_by(Process.slug)
    )).scalars().all()

    out: list[ProcessStats] = []
    for proc in procs:
        result = await db.execute(
            select(
                func.count(ProcessTimeEntry.id),
                func.coalesce(func.sum(ProcessTimeEntry.duration_seconds), 0),
                func.count(func.distinct(ProjectProcess.project_id)),
            )
            .select_from(ProcessTimeEntry)
            .join(
                ProjectProcess,
                ProcessTimeEntry.project_process_id == ProjectProcess.id,
            )
            .where(
                ProjectProcess.process_id == proc.id,
                ProcessTimeEntry.duration_seconds.is_not(None),
            )
        )
        entry_count, total_seconds, project_count = result.one()
        avg = (total_seconds / entry_count) if entry_count else None
        out.append(ProcessStats(
            process_id=proc.id,
            process_slug=proc.slug,
            process_name=proc.name,
            entry_count=int(entry_count),
            project_count=int(project_count),
            total_seconds=int(total_seconds),
            avg_seconds=avg,
        ))
    return out
