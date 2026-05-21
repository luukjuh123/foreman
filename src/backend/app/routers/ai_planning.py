"""AI Planning router — generate and apply Gantt schedules from task lists."""

import uuid
from datetime import date

from app.core.database import get_db
from app.models.project import Phase, Project, Task
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.projects import _assert_owner
from app.schemas.planning import (
    ApplyScheduleRequest,
    ApplyScheduleResponse,
    AutofillRequest,
    AutofillResponse,
)
from app.services.planning.autofill import compute_schedule, get_historical_hours
from app.services.planning.cpm import CpmTask
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


async def _load_project(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.phases).selectinload(Phase.tasks).selectinload(Task.dependencies)
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _build_cpm_tasks(project: Project) -> list[CpmTask]:
    """Flatten all tasks in the project into CpmTask objects."""
    cpm_tasks: list[CpmTask] = []
    for phase in project.phases:
        for task in phase.tasks:
            dep_ids = [str(d.depends_on_task_id) for d in task.dependencies]
            cpm_tasks.append(CpmTask(
                id=str(task.id),
                name=task.name,
                duration_hours=task.estimated_hours,
                dependencies=dep_ids,
            ))
    return cpm_tasks


@router.get("/health")
async def planning_health() -> dict:
    return {"status": "ok"}


@router.post("/autofill", response_model=AutofillResponse)
async def autofill_schedule(
    body: AutofillRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutofillResponse:
    """Generate a proposed Gantt schedule for all tasks in the project."""
    project = await _load_project(body.project_id, db)
    _assert_owner(project, current_user)

    cpm_tasks = _build_cpm_tasks(project)
    if not cpm_tasks:
        return AutofillResponse(proposals=[])

    task_names = [t.name for t in cpm_tasks]
    hist = await get_historical_hours(task_names, db)

    start = body.start_date or date.today()
    proposals = compute_schedule(
        cpm_tasks,
        start_date=start,
        working_hours_per_day=body.working_hours_per_day,
        historical_hours=hist,
    )
    return AutofillResponse(proposals=proposals)


@router.post("/apply", response_model=ApplyScheduleResponse)
async def apply_schedule(
    body: ApplyScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApplyScheduleResponse:
    """Apply a proposed schedule to the selected tasks (writes start_date/end_date)."""
    project = await _load_project(body.project_id, db)
    _assert_owner(project, current_user)

    cpm_tasks = _build_cpm_tasks(project)
    if not cpm_tasks or not body.task_ids:
        return ApplyScheduleResponse(updated_count=0)

    task_names = [t.name for t in cpm_tasks]
    hist = await get_historical_hours(task_names, db)

    start = body.start_date or date.today()
    proposals = compute_schedule(
        cpm_tasks,
        start_date=start,
        working_hours_per_day=body.working_hours_per_day,
        historical_hours=hist,
    )

    accepted_ids = {str(tid) for tid in body.task_ids}
    proposal_map = {p.task_id: p for p in proposals}

    task_db_map: dict[str, Task] = {}
    for phase in project.phases:
        for task in phase.tasks:
            task_db_map[str(task.id)] = task

    updated = 0
    for task_id_str in accepted_ids:
        proposal = proposal_map.get(task_id_str)
        task_obj = task_db_map.get(task_id_str)
        if proposal and task_obj:
            task_obj.start_date = proposal.proposed_start_date
            task_obj.end_date = proposal.proposed_end_date
            db.add(task_obj)
            updated += 1

    await db.commit()
    return ApplyScheduleResponse(updated_count=updated)
