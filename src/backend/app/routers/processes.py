"""Processes router — CRUD for process templates and project↔process links."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.process import Process, ProjectProcess
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.process import (
    ProcessCreate,
    ProcessListResponse,
    ProcessResponse,
    ProcessUpdate,
    ProjectProcessAttach,
    ProjectProcessListResponse,
    ProjectProcessResponse,
)
from app.schemas.process_stats import ProcessStatsListResponse, ProcessStatsResponse
from app.services.process_analytics.analytics import (
    stats_all_processes,
    stats_for_process,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Process templates
# ---------------------------------------------------------------------------

@router.get("/", response_model=ProcessListResponse)
async def list_processes(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessListResponse:
    count = (await db.execute(
        select(func.count()).select_from(Process).where(Process.deleted_at.is_(None))
    )).scalar_one()
    result = await db.execute(
        select(Process).where(Process.deleted_at.is_(None)).order_by(Process.slug)
    )
    items = result.scalars().all()
    return ProcessListResponse(
        data=[ProcessResponse.model_validate(p) for p in items],
        total=count,
    )


@router.post("/", response_model=ProcessResponse, status_code=status.HTTP_201_CREATED)
async def create_process(
    body: ProcessCreate,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessResponse:
    proc = Process(
        slug=body.slug,
        name=body.name,
        description=body.description,
        unit=body.unit,
    )
    db.add(proc)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Process with that slug already exists",
        )
    await db.refresh(proc)
    return ProcessResponse.model_validate(proc)


async def _get_process_or_404(process_id: uuid.UUID, db: AsyncSession) -> Process:
    result = await db.execute(
        select(Process).where(Process.id == process_id, Process.deleted_at.is_(None))
    )
    proc = result.scalar_one_or_none()
    if proc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")
    return proc


@router.get("/projects/{project_id}", response_model=ProjectProcessListResponse)
async def list_project_processes(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectProcessListResponse:
    await _get_project_owned(project_id, user, db)
    result = await db.execute(
        select(ProjectProcess)
        .where(ProjectProcess.project_id == project_id)
        .options(selectinload(ProjectProcess.process))
        .order_by(ProjectProcess.created_at)
    )
    return ProjectProcessListResponse(
        data=[ProjectProcessResponse.model_validate(pp) for pp in result.scalars().all()]
    )


@router.post(
    "/projects/{project_id}",
    response_model=ProjectProcessResponse,
    status_code=status.HTTP_201_CREATED,
)
async def attach_process_to_project(
    project_id: uuid.UUID,
    body: ProjectProcessAttach,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectProcessResponse:
    await _get_project_owned(project_id, user, db)
    await _get_process_or_404(body.process_id, db)
    link = ProjectProcess(
        project_id=project_id, process_id=body.process_id, notes=body.notes
    )
    db.add(link)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Process already attached to project",
        )
    result = await db.execute(
        select(ProjectProcess)
        .where(ProjectProcess.id == link.id)
        .options(selectinload(ProjectProcess.process))
    )
    return ProjectProcessResponse.model_validate(result.scalar_one())


@router.delete(
    "/projects/{project_id}/{project_process_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def detach_process_from_project(
    project_id: uuid.UUID,
    project_process_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_project_owned(project_id, user, db)
    result = await db.execute(
        select(ProjectProcess).where(
            ProjectProcess.id == project_process_id,
            ProjectProcess.project_id == project_id,
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    await db.delete(link)
    await db.commit()


@router.get("/stats", response_model=ProcessStatsListResponse)
async def list_process_stats(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessStatsListResponse:
    """Average duration per process across all projects — feeds AI planning."""
    items = await stats_all_processes(db)
    return ProcessStatsListResponse(
        data=[ProcessStatsResponse(**item.__dict__) for item in items]
    )


@router.get("/{process_id}/stats", response_model=ProcessStatsResponse)
async def get_process_stats(
    process_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessStatsResponse:
    stats = await stats_for_process(process_id, db)
    if stats is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")
    return ProcessStatsResponse(**stats.__dict__)


@router.get("/{process_id}", response_model=ProcessResponse)
async def get_process(
    process_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessResponse:
    proc = await _get_process_or_404(process_id, db)
    return ProcessResponse.model_validate(proc)


@router.put("/{process_id}", response_model=ProcessResponse)
async def update_process(
    process_id: uuid.UUID,
    body: ProcessUpdate,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProcessResponse:
    proc = await _get_process_or_404(process_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(proc, field, value)
    await db.commit()
    await db.refresh(proc)
    return ProcessResponse.model_validate(proc)


async def _get_project_owned(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project
