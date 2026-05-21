"""Time tracking router — start/stop entries per project_process."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.process import ProjectProcess
from app.models.project import Project
from app.models.time_entry import ProcessTimeEntry
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.time_entry import (
    TimeEntryListResponse,
    TimeEntryResponse,
    TimeEntryStartRequest,
    TimeEntryStopRequest,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_project_process_owned(
    project_process_id: uuid.UUID, user: User, db: AsyncSession
) -> ProjectProcess:
    """Fetch a ProjectProcess and check the linked project is owned by user."""
    result = await db.execute(
        select(ProjectProcess, Project)
        .join(Project, ProjectProcess.project_id == Project.id)
        .where(
            ProjectProcess.id == project_process_id,
            Project.deleted_at.is_(None),
        )
    )
    row = result.first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project process not found"
        )
    pp, project = row
    if project.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your project process"
        )
    return pp


@router.post(
    "/{project_process_id}/start",
    response_model=TimeEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_time_entry(
    project_process_id: uuid.UUID,
    body: TimeEntryStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryResponse:
    await _get_project_process_owned(project_process_id, user, db)

    # Reject if there's already an open entry for this project_process.
    existing = (await db.execute(
        select(ProcessTimeEntry).where(
            ProcessTimeEntry.project_process_id == project_process_id,
            ProcessTimeEntry.stopped_at.is_(None),
        )
    )).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A time entry is already running for this process",
        )

    entry = ProcessTimeEntry(
        project_process_id=project_process_id,
        started_at=datetime.now(UTC),
        notes=body.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimeEntryResponse.model_validate(entry)


@router.post(
    "/{project_process_id}/stop",
    response_model=TimeEntryResponse,
)
async def stop_time_entry(
    project_process_id: uuid.UUID,
    body: TimeEntryStopRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryResponse:
    await _get_project_process_owned(project_process_id, user, db)

    entry = (await db.execute(
        select(ProcessTimeEntry).where(
            ProcessTimeEntry.project_process_id == project_process_id,
            ProcessTimeEntry.stopped_at.is_(None),
        )
    )).scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No running time entry for this process",
        )

    now = datetime.now(UTC)
    started = entry.started_at
    # SQLite may strip tzinfo on read — treat naive as UTC.
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    delta = (now - started).total_seconds()
    entry.stopped_at = now
    entry.duration_seconds = max(0, int(delta))
    if body.notes is not None:
        entry.notes = body.notes

    await db.commit()
    await db.refresh(entry)
    return TimeEntryResponse.model_validate(entry)


@router.get(
    "/{project_process_id}",
    response_model=TimeEntryListResponse,
)
async def list_time_entries(
    project_process_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryListResponse:
    await _get_project_process_owned(project_process_id, user, db)
    result = await db.execute(
        select(ProcessTimeEntry)
        .where(ProcessTimeEntry.project_process_id == project_process_id)
        .order_by(ProcessTimeEntry.started_at)
    )
    entries = result.scalars().all()
    total = sum((e.duration_seconds or 0) for e in entries)
    return TimeEntryListResponse(
        data=[TimeEntryResponse.model_validate(e) for e in entries],
        total_seconds=total,
    )
