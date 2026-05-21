"""Photo recognition router — upload site photos and identify processes."""

from __future__ import annotations

import uuid

from app.core.database import get_db
from app.models.process import Process
from app.models.process_photo import ProcessPhoto
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.process_photo import (
    PhotoListResponse,
    PhotoResponse,
    PhotoUploadRequest,
)
from app.services.recognition.photo_client import (
    PhotoRecognitionClient,
    get_default_client,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_project_owned(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


def _to_response(photo: ProcessPhoto, slug: str | None) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        project_id=photo.project_id,
        recognized_process_id=photo.recognized_process_id,
        recognized_process_slug=slug,
        image_url=photo.image_url,
        completion_pct=photo.completion_pct,
        reasoning=photo.reasoning,
        created_at=photo.created_at,
    )


@router.post(
    "/projects/{project_id}",
    response_model=PhotoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    project_id: uuid.UUID,
    body: PhotoUploadRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    client: PhotoRecognitionClient = Depends(get_default_client),
) -> PhotoResponse:
    await _get_project_owned(project_id, user, db)

    result = await client.analyze(body.image_url)

    recognized_id: uuid.UUID | None = None
    recognized_slug: str | None = None
    if result.process_slug:
        proc = (await db.execute(
            select(Process).where(
                Process.slug == result.process_slug, Process.deleted_at.is_(None)
            )
        )).scalar_one_or_none()
        if proc is not None:
            recognized_id = proc.id
            recognized_slug = proc.slug

    photo = ProcessPhoto(
        project_id=project_id,
        recognized_process_id=recognized_id,
        image_url=body.image_url,
        completion_pct=result.completion_pct,
        reasoning=result.reasoning,
        raw_analysis=result.raw,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return _to_response(photo, recognized_slug)


@router.get(
    "/projects/{project_id}",
    response_model=PhotoListResponse,
)
async def list_photos(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhotoListResponse:
    await _get_project_owned(project_id, user, db)
    result = await db.execute(
        select(ProcessPhoto, Process.slug)
        .join(Process, ProcessPhoto.recognized_process_id == Process.id, isouter=True)
        .where(ProcessPhoto.project_id == project_id)
        .order_by(ProcessPhoto.created_at)
    )
    rows = result.all()
    return PhotoListResponse(data=[_to_response(p, slug) for (p, slug) in rows])
