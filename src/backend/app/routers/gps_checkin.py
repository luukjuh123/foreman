"""GPS check-in/check-out router — geofence management and attendance logging."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.geofence import AttendanceLog, ProjectGeofence
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.geofence import (
    AttendanceListResponse,
    AttendanceLogResponse,
    CheckInRequest,
    CheckOutRequest,
    GeofenceCreate,
    GeofenceResponse,
)
from app.services.geofence import is_within_geofence
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_owned_project(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.deleted_at.is_(None)))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


# ---------------------------------------------------------------------------
# Geofence
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/geofence",
    response_model=GeofenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_geofence(
    project_id: uuid.UUID,
    body: GeofenceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeofenceResponse:
    await _get_owned_project(project_id, user, db)

    # Upsert: replace any existing geofence for this project.
    existing = (
        await db.execute(select(ProjectGeofence).where(ProjectGeofence.project_id == project_id))
    ).scalar_one_or_none()

    if existing is not None:
        existing.lat = body.lat
        existing.lng = body.lng
        existing.radius_meters = body.radius_meters
        await db.commit()
        await db.refresh(existing)
        return GeofenceResponse.model_validate(existing)

    fence = ProjectGeofence(
        project_id=project_id,
        lat=body.lat,
        lng=body.lng,
        radius_meters=body.radius_meters,
    )
    db.add(fence)
    await db.commit()
    await db.refresh(fence)
    return GeofenceResponse.model_validate(fence)


@router.get(
    "/{project_id}/geofence",
    response_model=GeofenceResponse,
)
async def get_geofence(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeofenceResponse:
    await _get_owned_project(project_id, user, db)

    fence = (
        await db.execute(select(ProjectGeofence).where(ProjectGeofence.project_id == project_id))
    ).scalar_one_or_none()

    if fence is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No geofence configured")

    return GeofenceResponse.model_validate(fence)


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/checkin",
    response_model=AttendanceLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def checkin(
    project_id: uuid.UUID,
    body: CheckInRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceLogResponse:
    await _get_owned_project(project_id, user, db)

    fence = (
        await db.execute(select(ProjectGeofence).where(ProjectGeofence.project_id == project_id))
    ).scalar_one_or_none()
    if fence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No geofence configured for this project",
        )

    if not is_within_geofence(body.lat, body.lng, fence.lat, fence.lng, fence.radius_meters):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Location is outside the project geofence",
        )

    # Reject if already checked in (open entry exists).
    open_entry = (
        await db.execute(
            select(AttendanceLog).where(
                AttendanceLog.project_id == project_id,
                AttendanceLog.user_id == user.id,
                AttendanceLog.checked_out_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if open_entry is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already checked in to this project",
        )

    log = AttendanceLog(
        project_id=project_id,
        user_id=user.id,
        checked_in_at=datetime.now(UTC),
        checkin_lat=body.lat,
        checkin_lng=body.lng,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return AttendanceLogResponse.model_validate(log)


# ---------------------------------------------------------------------------
# Check-out
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/checkout",
    response_model=AttendanceLogResponse,
)
async def checkout(
    project_id: uuid.UUID,
    body: CheckOutRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceLogResponse:
    await _get_owned_project(project_id, user, db)

    log = (
        await db.execute(
            select(AttendanceLog).where(
                AttendanceLog.project_id == project_id,
                AttendanceLog.user_id == user.id,
                AttendanceLog.checked_out_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active check-in for this project",
        )

    now = datetime.now(UTC)
    checked_in = log.checked_in_at
    if checked_in.tzinfo is None:
        checked_in = checked_in.replace(tzinfo=UTC)

    log.checked_out_at = now
    log.checkout_lat = body.lat
    log.checkout_lng = body.lng
    log.duration_seconds = max(0, int((now - checked_in).total_seconds()))

    await db.commit()
    await db.refresh(log)
    return AttendanceLogResponse.model_validate(log)


# ---------------------------------------------------------------------------
# Attendance report
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}/attendance",
    response_model=AttendanceListResponse,
)
async def attendance_report(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceListResponse:
    await _get_owned_project(project_id, user, db)

    result = await db.execute(
        select(AttendanceLog).where(AttendanceLog.project_id == project_id).order_by(AttendanceLog.checked_in_at)
    )
    logs = result.scalars().all()
    return AttendanceListResponse(data=[AttendanceLogResponse.model_validate(e) for e in logs])
