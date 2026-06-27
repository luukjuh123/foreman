import io
import json
import uuid
import zipfile
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.process_photo import ProcessPhoto
from app.models.project import Phase, Project, Task, TaskDependency
from app.models.report import Report
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.deps import apply_updates, get_or_404
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
from app.services.health_score import HealthScoreResult, calculate_health_score
from app.services.planning.cpm import detect_cycle
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()

_PROJECT_LOAD = selectinload(Project.phases).selectinload(Phase.tasks)
_PHASE_LOAD = selectinload(Phase.tasks)


async def _get_project_or_404(project_id: uuid.UUID, db: AsyncSession) -> Project:
    return await get_or_404(db, Project, Project.id == project_id, Project.deleted_at.is_(None), options=_PROJECT_LOAD)


async def _owned_project(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    project = await _get_project_or_404(project_id, db)
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


async def _reload(obj: Project | Phase, db: AsyncSession) -> ProjectResponse | PhaseResponse:
    await db.commit()
    await db.refresh(obj)
    if isinstance(obj, Project):
        return ProjectResponse.model_validate((await db.execute(select(Project).where(Project.id == obj.id).options(_PROJECT_LOAD))).scalar_one())
    return PhaseResponse.model_validate((await db.execute(select(Phase).where(Phase.id == obj.id).options(_PHASE_LOAD))).scalar_one())


async def _get_phase_or_404(project_id: uuid.UUID, phase_id: uuid.UUID, db: AsyncSession) -> Phase:
    return await get_or_404(db, Phase, Phase.id == phase_id, Phase.project_id == project_id, options=_PHASE_LOAD)


async def _get_task_or_404(phase_id: uuid.UUID, task_id: uuid.UUID, db: AsyncSession) -> Task:
    return await get_or_404(db, Task, Task.id == task_id, Task.phase_id == phase_id)


async def _get_task_in_project_or_404(project_id: uuid.UUID, task_id: uuid.UUID, db: AsyncSession) -> Task:
    if (task := (await db.execute(
        select(Task).join(Phase, Task.phase_id == Phase.id).where(Task.id == task_id, Phase.project_id == project_id)
    )).scalar_one_or_none()) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _pick(obj: object, *attrs: str) -> dict:
    return {a: getattr(obj, a) for a in attrs}


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectListResponse:
    where = (Project.owner_id == current_user.id, Project.deleted_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(Project).where(*where))).scalar_one()
    result = await db.execute(select(Project).where(*where).options(_PROJECT_LOAD).offset((page - 1) * per_page).limit(per_page))
    return ProjectListResponse(data=[ProjectResponse.model_validate(p) for p in result.scalars().all()], total=total, page=page, per_page=per_page)


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    await enforce_project_limit(current_user.id, db)
    project = Project(owner_id=current_user.id, **body.model_dump())
    db.add(project)
    await increment_projects(current_user.id, db, +1)
    return await _reload(project, db)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    return ProjectResponse.model_validate(await _owned_project(project_id, current_user, db))


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    project = await _owned_project(project_id, current_user, db)
    apply_updates(project, body)
    return await _reload(project, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _owned_project(project_id, current_user, db)
    project.deleted_at = datetime.now(UTC)
    await increment_projects(current_user.id, db, -1)
    await db.commit()


@router.post("/{project_id}/phases", response_model=PhaseResponse, status_code=status.HTTP_201_CREATED)
async def create_phase(
    project_id: uuid.UUID,
    body: PhaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhaseResponse:
    await _owned_project(project_id, current_user, db)
    phase = Phase(project_id=project_id, **body.model_dump())
    db.add(phase)
    return await _reload(phase, db)


@router.put("/{project_id}/phases/{phase_id}", response_model=PhaseResponse)
async def update_phase(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    body: PhaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhaseResponse:
    await _owned_project(project_id, current_user, db)
    phase = await _get_phase_or_404(project_id, phase_id, db)
    apply_updates(phase, body)
    return await _reload(phase, db)


@router.delete("/{project_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _owned_project(project_id, current_user, db)
    phase = await _get_phase_or_404(project_id, phase_id, db)
    await db.delete(phase)
    await db.commit()


@router.post("/{project_id}/phases/{phase_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    await _owned_project(project_id, current_user, db)
    await _get_phase_or_404(project_id, phase_id, db)
    task = Task(phase_id=phase_id, **body.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


@router.put("/{project_id}/phases/{phase_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    await _owned_project(project_id, current_user, db)
    task = await _get_task_or_404(phase_id, task_id, db)
    apply_updates(task, body)
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


@router.delete("/{project_id}/phases/{phase_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    project_id: uuid.UUID,
    phase_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _owned_project(project_id, current_user, db)
    task = await _get_task_or_404(phase_id, task_id, db)
    await db.delete(task)
    await db.commit()


@router.post("/{project_id}/tasks/{task_id}/dependencies", response_model=TaskDependencyResponse, status_code=status.HTTP_201_CREATED)
async def add_dependency(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskDependencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskDependencyResponse:
    await _owned_project(project_id, current_user, db)
    await _get_task_in_project_or_404(project_id, task_id, db)
    await _get_task_in_project_or_404(project_id, body.depends_on_task_id, db)
    if await detect_cycle(task_id, body.depends_on_task_id, db):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Adding this dependency would create a cycle in the task graph")
    dep = TaskDependency(task_id=task_id, depends_on_task_id=body.depends_on_task_id)
    db.add(dep)
    await db.commit()
    await db.refresh(dep)
    return TaskDependencyResponse.model_validate(dep)


@router.delete("/{project_id}/tasks/{task_id}/dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_dependency(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    dependency_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _owned_project(project_id, current_user, db)
    dep = await get_or_404(db, TaskDependency, TaskDependency.id == dependency_id, TaskDependency.task_id == task_id, detail="Dependency not found")
    await db.delete(dep)
    await db.commit()


_PROJECT_EXPORT_FIELDS = ("id", "name", "description", "status", "start_date", "end_date", "budget_cents", "created_at")
_PHASE_EXPORT_FIELDS = ("id", "name", "description", "order_index", "status", "start_date", "end_date")
_TASK_EXPORT_FIELDS = ("id", "name", "description", "status", "priority", "estimated_hours", "labor_cost_cents", "start_date", "end_date")


def _default(obj: object) -> str:
    if isinstance(obj, (uuid.UUID, datetime)):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


@router.get("/{project_id}/export")
async def export_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    project = await _owned_project(project_id, current_user, db)
    invoices = (await db.execute(select(Invoice).where(Invoice.project_id == project_id))).scalars().all()
    reports = (await db.execute(select(Report).where(Report.project_id == project_id))).scalars().all()
    photos = (await db.execute(select(ProcessPhoto).where(ProcessPhoto.project_id == project_id))).scalars().all()
    files = {
        "project.json": {
            **_pick(project, *_PROJECT_EXPORT_FIELDS),
            "phases": [{**_pick(ph, *_PHASE_EXPORT_FIELDS), "tasks": [_pick(t, *_TASK_EXPORT_FIELDS) for t in ph.tasks]} for ph in project.phases],
        },
        "invoices.json": [_pick(i, "id", "status", "total_cents", "created_at") for i in invoices],
        "reports.json": [_pick(r, "id", "type", "title", "created_at") for r in reports],
        "photos.json": [_pick(p, "id", "image_url", "completion_pct", "created_at") for p in photos],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, json.dumps(data, default=_default, indent=2))
    buf.seek(0)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in project.name)
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{safe_name}_{project_id}.zip"'})


@router.get("/{project_id}/health-score", response_model=HealthScoreResult)
async def get_health_score(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HealthScoreResult:
    return calculate_health_score(await _owned_project(project_id, current_user, db))
