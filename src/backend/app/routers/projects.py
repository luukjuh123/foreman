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
from app.routers.deps import add_commit_refresh_validate, apply_updates, get_or_404
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
_U = Depends(get_current_user)
_DB = Depends(get_db)


async def _get_project_or_404(pid: uuid.UUID, db: AsyncSession) -> Project:
    return await get_or_404(db, Project, Project.id == pid, Project.deleted_at.is_(None), options=_PROJECT_LOAD)


async def _owned(pid: uuid.UUID, user: User, db: AsyncSession) -> Project:
    if (p := await _get_project_or_404(pid, db)).owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return p


async def _reload(obj: Project | Phase, db: AsyncSession) -> ProjectResponse | PhaseResponse:
    await db.commit()
    await db.refresh(obj)
    model, cls, opts = (Project, ProjectResponse, _PROJECT_LOAD) if isinstance(obj, Project) else (Phase, PhaseResponse, _PHASE_LOAD)
    return cls.model_validate((await db.execute(select(model).where(model.id == obj.id).options(opts))).scalar_one())


async def _phase_404(pid: uuid.UUID, phid: uuid.UUID, db: AsyncSession) -> Phase:
    return await get_or_404(db, Phase, Phase.id == phid, Phase.project_id == pid, options=_PHASE_LOAD)


async def _task_404(phid: uuid.UUID, tid: uuid.UUID, db: AsyncSession) -> Task:
    return await get_or_404(db, Task, Task.id == tid, Task.phase_id == phid)


async def _task_in_project_404(pid: uuid.UUID, tid: uuid.UUID, db: AsyncSession) -> Task:
    if (t := (await db.execute(select(Task).join(Phase, Task.phase_id == Phase.id).where(Task.id == tid, Phase.project_id == pid))).scalar_one_or_none()) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return t


def _pick(obj: object, *attrs: str) -> dict:
    return {a: getattr(obj, a) for a in attrs}


async def _del_commit(db: AsyncSession, obj: object) -> None:
    await db.delete(obj)
    await db.commit()


@router.get("/", response_model=ProjectListResponse)
async def list_projects(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100), current_user: User = _U, db: AsyncSession = _DB) -> ProjectListResponse:
    where = (Project.owner_id == current_user.id, Project.deleted_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(Project).where(*where))).scalar_one()
    rows = (await db.execute(select(Project).where(*where).options(_PROJECT_LOAD).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return ProjectListResponse(data=[ProjectResponse.model_validate(p) for p in rows], total=total, page=page, per_page=per_page)


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, current_user: User = _U, db: AsyncSession = _DB) -> ProjectResponse:
    await enforce_project_limit(current_user.id, db)
    db.add(p := Project(owner_id=current_user.id, **body.model_dump()))
    await increment_projects(current_user.id, db, +1)
    return await _reload(p, db)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> ProjectResponse:
    return ProjectResponse.model_validate(await _owned(project_id, current_user, db))


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: uuid.UUID, body: ProjectUpdate, current_user: User = _U, db: AsyncSession = _DB) -> ProjectResponse:
    apply_updates(p := await _owned(project_id, current_user, db), body)
    return await _reload(p, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    (await _owned(project_id, current_user, db)).deleted_at = datetime.now(UTC)
    await increment_projects(current_user.id, db, -1)
    await db.commit()


@router.post("/{project_id}/phases", response_model=PhaseResponse, status_code=status.HTTP_201_CREATED)
async def create_phase(project_id: uuid.UUID, body: PhaseCreate, current_user: User = _U, db: AsyncSession = _DB) -> PhaseResponse:
    await _owned(project_id, current_user, db)
    db.add(ph := Phase(project_id=project_id, **body.model_dump()))
    return await _reload(ph, db)


@router.put("/{project_id}/phases/{phase_id}", response_model=PhaseResponse)
async def update_phase(project_id: uuid.UUID, phase_id: uuid.UUID, body: PhaseUpdate, current_user: User = _U, db: AsyncSession = _DB) -> PhaseResponse:
    await _owned(project_id, current_user, db)
    apply_updates(ph := await _phase_404(project_id, phase_id, db), body)
    return await _reload(ph, db)


@router.delete("/{project_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(project_id: uuid.UUID, phase_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    await _owned(project_id, current_user, db)
    await _del_commit(db, await _phase_404(project_id, phase_id, db))


@router.post("/{project_id}/phases/{phase_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(project_id: uuid.UUID, phase_id: uuid.UUID, body: TaskCreate, current_user: User = _U, db: AsyncSession = _DB) -> TaskResponse:
    await _owned(project_id, current_user, db)
    await _phase_404(project_id, phase_id, db)
    return await add_commit_refresh_validate(db, Task(phase_id=phase_id, **body.model_dump()), TaskResponse)


@router.put("/{project_id}/phases/{phase_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(project_id: uuid.UUID, phase_id: uuid.UUID, task_id: uuid.UUID, body: TaskUpdate, current_user: User = _U, db: AsyncSession = _DB) -> TaskResponse:
    await _owned(project_id, current_user, db)
    apply_updates(t := await _task_404(phase_id, task_id, db), body)
    return await add_commit_refresh_validate(db, t, TaskResponse)


@router.delete("/{project_id}/phases/{phase_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(project_id: uuid.UUID, phase_id: uuid.UUID, task_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    await _owned(project_id, current_user, db)
    await _del_commit(db, await _task_404(phase_id, task_id, db))


@router.post("/{project_id}/tasks/{task_id}/dependencies", response_model=TaskDependencyResponse, status_code=status.HTTP_201_CREATED)
async def add_dependency(project_id: uuid.UUID, task_id: uuid.UUID, body: TaskDependencyCreate, current_user: User = _U, db: AsyncSession = _DB) -> TaskDependencyResponse:
    await _owned(project_id, current_user, db)
    await _task_in_project_404(project_id, task_id, db)
    await _task_in_project_404(project_id, body.depends_on_task_id, db)
    if await detect_cycle(task_id, body.depends_on_task_id, db):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Adding this dependency would create a cycle in the task graph")
    return await add_commit_refresh_validate(db, TaskDependency(task_id=task_id, depends_on_task_id=body.depends_on_task_id), TaskDependencyResponse)


@router.delete("/{project_id}/tasks/{task_id}/dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_dependency(project_id: uuid.UUID, task_id: uuid.UUID, dependency_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    await _owned(project_id, current_user, db)
    await _del_commit(db, await get_or_404(db, TaskDependency, TaskDependency.id == dependency_id, TaskDependency.task_id == task_id, detail="Dependency not found"))


_P_EXP = ("id", "name", "description", "status", "start_date", "end_date", "budget_cents", "created_at")
_PH_EXP = ("id", "name", "description", "order_index", "status", "start_date", "end_date")
_T_EXP = ("id", "name", "description", "status", "priority", "estimated_hours", "labor_cost_cents", "start_date", "end_date")


def _default(obj: object) -> str:
    if isinstance(obj, (uuid.UUID, datetime)):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


@router.get("/{project_id}/export")
async def export_project(project_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> StreamingResponse:
    project = await _owned(project_id, current_user, db)
    invoices, reports, photos = [(await db.execute(select(m).where(m.project_id == project_id))).scalars().all() for m in (Invoice, Report, ProcessPhoto)]
    files = {
        "project.json": {**_pick(project, *_P_EXP), "phases": [{**_pick(ph, *_PH_EXP), "tasks": [_pick(t, *_T_EXP) for t in ph.tasks]} for ph in project.phases]},
        "invoices.json": [_pick(i, "id", "status", "total_cents", "created_at") for i in invoices],
        "reports.json": [_pick(r, "id", "type", "title", "created_at") for r in reports],
        "photos.json": [_pick(p, "id", "image_url", "completion_pct", "created_at") for p in photos],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, json.dumps(data, default=_default, indent=2))
    buf.seek(0)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in project.name)
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{safe}_{project_id}.zip"'})


@router.get("/{project_id}/health-score", response_model=HealthScoreResult)
async def get_health_score(project_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> HealthScoreResult:
    return calculate_health_score(await _owned(project_id, current_user, db))
