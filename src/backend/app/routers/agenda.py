"""Agenda router — weekly / daily / range views of scheduled tasks across all projects."""

from datetime import date, timedelta

from app.core.database import get_db
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.agenda import (
    AgendaDay,
    AgendaDayResponse,
    AgendaTask,
    AgendaWeekResponse,
)
from app.services.calendar import build_ics
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _fetch_tasks_in_range(
    user: User, range_start: date, range_end: date, db: AsyncSession
) -> list[tuple[Task, Phase, Project]]:
    """Return (task, phase, project) tuples for all user-owned tasks overlapping range.

    Overlap rule: ``task.start_date <= range_end`` AND ``task.end_date >= range_start``.
    Tasks missing either date are excluded — they are not "scheduled".
    """
    stmt = (
        select(Task, Phase, Project)
        .join(Phase, Task.phase_id == Phase.id)
        .join(Project, Phase.project_id == Project.id)
        .where(
            Project.owner_id == user.id,
            Project.deleted_at.is_(None),
            Task.start_date.is_not(None),
            Task.end_date.is_not(None),
            and_(
                Task.start_date <= range_end,
                Task.end_date >= range_start,
            ),
        )
        .order_by(Task.start_date.asc(), Task.priority.desc())
    )
    result = await db.execute(stmt)
    return [(row[0], row[1], row[2]) for row in result.all()]


def _to_agenda_task(task: Task, phase: Phase, project: Project) -> AgendaTask:
    return AgendaTask(
        task_id=task.id,
        project_id=project.id,
        project_name=project.name,
        phase_id=phase.id,
        phase_name=phase.name,
        name=task.name,
        description=task.description,
        status=task.status,
        priority=task.priority,
        estimated_hours=task.estimated_hours,
        start_date=task.start_date,
        end_date=task.end_date,
        start_time=None,
        end_time=None,
        location=None,
    )


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/week", response_model=AgendaWeekResponse)
async def week_view(
    week_start: date | None = Query(
        None,
        description=(
            "Date inside the desired week. Defaults to today. The agenda always starts on the Monday of that week."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgendaWeekResponse:
    """Return the 7-day agenda starting on the Monday of the requested week."""
    anchor = week_start or date.today()
    start = _monday_of(anchor)
    end = start + timedelta(days=6)

    rows = await _fetch_tasks_in_range(current_user, start, end, db)

    days: list[AgendaDay] = []
    for i in range(7):
        day = start + timedelta(days=i)
        day_tasks = [_to_agenda_task(t, p, proj) for (t, p, proj) in rows if t.start_date <= day <= t.end_date]
        days.append(AgendaDay(date=day, tasks=day_tasks))

    return AgendaWeekResponse(week_start=start, week_end=end, days=days)


@router.get("/day", response_model=AgendaDayResponse)
async def day_view(
    day: date | None = Query(None, description="Calendar day. Defaults to today."),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgendaDayResponse:
    """Return all tasks scheduled on the given day."""
    target = day or date.today()
    rows = await _fetch_tasks_in_range(current_user, target, target, db)
    tasks = [_to_agenda_task(t, p, proj) for (t, p, proj) in rows]
    return AgendaDayResponse(date=target, tasks=tasks)


@router.get("/range", response_model=list[AgendaDay])
async def range_view(
    start: date = Query(..., description="Inclusive range start."),
    end: date = Query(..., description="Inclusive range end."),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AgendaDay]:
    """Return tasks grouped by day for an arbitrary date range."""
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="`end` must be on or after `start`",
        )
    if (end - start).days > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Range cannot exceed 366 days",
        )

    rows = await _fetch_tasks_in_range(current_user, start, end, db)
    days: list[AgendaDay] = []
    span = (end - start).days
    for i in range(span + 1):
        d = start + timedelta(days=i)
        day_tasks = [_to_agenda_task(t, p, proj) for (t, p, proj) in rows if t.start_date <= d <= t.end_date]
        days.append(AgendaDay(date=d, tasks=day_tasks))
    return days


# Re-exported for the iCal exporter (separate PR will use it).
__all__ = ["_fetch_tasks_in_range", "router"]


@router.get(
    "/export.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
)
async def export_ics(
    start: date = Query(..., description="Inclusive range start."),
    end: date = Query(..., description="Inclusive range end."),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export agenda tasks in [start, end] as an RFC 5545 iCalendar (.ics) file."""
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="`end` must be on or after `start`",
        )
    if (end - start).days > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Range cannot exceed 366 days",
        )

    rows = await _fetch_tasks_in_range(current_user, start, end, db)
    body = build_ics(rows)
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": (f'attachment; filename="foreman-agenda-{start.isoformat()}-{end.isoformat()}.ics"'),
        },
    )
