"""Projects router — CRUD for projects, phases, tasks, and task dependencies."""

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.project import Phase, Project, Task, TaskDependency
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.project import (
    PhaseCreate,
    PhaseResponse,
    PhaseUpdate,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyResponse,
    TaskResponse,
    TaskUpdate,
)
from app.services.billing.subscriptions import enforce_project_limit
from app.services.billing.usage import increment_projects
from app.services.planning.cpm import detect_cycle
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.deleted_at.is_(None))
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _assert_owner(project: Project, user: User) -> None:
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")


# ---------------------------------------------------------------------------
# Project endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectListResponse:
    offset = (page - 1) * per_page

    count_result = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(
            Project.owner_id == current_user.id,
            Project.deleted_at.is_(None),
        )
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Project)
        .where(Project.owner_id == current_user.id, Project.deleted_at.is_(None))
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
        .offset(offset)
        .limit(per_page)
    )
    projects = result.scalars().all()

    return ProjectListResponse(
        data=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    await enforce_project_limit(current_user.id, db)
    project = Project(
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        status=body.status,
        start_date=body.start_date,
        end_date=body.end_date,
        budget_cents=body.budget_cents,
        location_lat=body.location_lat,
        location_lon=body.location_lon,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    await increment_projects(current_user.id, db, +1)
    await db.commit()
    # Load relationships for response
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    return ProjectResponse.model_validate(result.scalar_one())


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    return ProjectResponse.model_validate(project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    return ProjectResponse.model_validate(result.scalar_one())


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    project.deleted_at = datetime.now(UTC)
    await increment_projects(current_user.id, db, -1)
    await db.commit()


# ---------------------------------------------------------------------------
# Phase endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/phases",
    response_model=PhaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_phase(
    project_id: uuid.UUID,
    body: PhaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhaseResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)

    phase = Phase(
        project_id=project_id,
        name=body.name,
        description=body.description,
        order_index=body.order_index,
        status=body.status,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(phase)
    await db.commit()
    await db.refresh(phase)
    result = await db.execute(select(Phase).where(Phase.id == phase.id).options(selectinload(Phase.tasks)))
    return PhaseResponse.model_validate(result.scalar_one())


async def _get_phase_or_404(project_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession) -> Phase:
    result = await db.execute(
        select(Phase).where(Phase.id == phase_id, Phase.project_id == project_id).options(selectinload(Phase.tasks))
    )
    phase = result.scalar_one_or_none()
    if phase is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase not found")
    return phase


@router.put("/{project_id}/phases/{phase_id}", response_model=PhaseResponse)
async def update_phase(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    body: PhaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhaseResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    phase = await _get_phase_or_404(project_id, phase_id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(phase, field, value)

    await db.commit()
    await db.refresh(phase)
    result = await db.execute(select(Phase).where(Phase.id == phase.id).options(selectinload(Phase.tasks)))
    return PhaseResponse.model_validate(result.scalar_one())


@router.delete("/{project_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    phase = await _get_phase_or_404(project_id, phase_id, db)
    await db.delete(phase)
    await db.commit()


# ---------------------------------------------------------------------------
# Task endpoints
# ---------------------------------------------------------------------------


async def _get_task_or_404(phase_id: uuid.UUID, task_id: uuid.UUID, db: AsyncSession) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.phase_id == phase_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post(
    "/{project_id}/phases/{phase_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    await _get_phase_or_404(project_id, phase_id, db)

    task = Task(
        phase_id=phase_id,
        name=body.name,
        description=body.description,
        status=body.status,
        priority=body.priority,
        estimated_hours=body.estimated_hours,
        labor_cost_cents=body.labor_cost_cents,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


@router.put(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}",
    response_model=TaskResponse,
)
async def update_task(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    task = await _get_task_or_404(phase_id, task_id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


@router.delete(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_task(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    task = await _get_task_or_404(phase_id, task_id, db)
    await db.delete(task)
    await db.commit()


# ---------------------------------------------------------------------------
# Task dependency endpoints
# ---------------------------------------------------------------------------


async def _get_task_in_project_or_404(project_id: uuid.UUID, task_id: uuid.UUID, db: AsyncSession) -> Task:
    """Get a task that belongs to any phase of the given project."""
    result = await db.execute(
        select(Task).join(Phase, Task.phase_id == Phase.id).where(Task.id == task_id, Phase.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post(
    "/{project_id}/tasks/{task_id}/dependencies",
    response_model=TaskDependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_dependency(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskDependencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskDependencyResponse:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)
    await _get_task_in_project_or_404(project_id, task_id, db)
    await _get_task_in_project_or_404(project_id, body.depends_on_task_id, db)

    if await detect_cycle(task_id, body.depends_on_task_id, db):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Adding this dependency would create a cycle in the task graph",
        )

    dep = TaskDependency(task_id=task_id, depends_on_task_id=body.depends_on_task_id)
    db.add(dep)
    await db.commit()
    await db.refresh(dep)
    return TaskDependencyResponse.model_validate(dep)


@router.delete(
    "/{project_id}/tasks/{task_id}/dependencies/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_dependency(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    dependency_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _get_project_or_404(project_id, db)
    _assert_owner(project, current_user)

    result = await db.execute(
        select(TaskDependency).where(
            TaskDependency.id == dependency_id,
            TaskDependency.task_id == task_id,
        )
    )
    dep = result.scalar_one_or_none()
    if dep is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dependency not found")

    await db.delete(dep)
    await db.commit()
