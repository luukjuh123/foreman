"""GPS check-in/check-out router — geofence management and attendance logging."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.geofence import AttendanceLog, ProjectGeofence
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.deps import get_or_404
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
    return await get_or_404(
        db, Project,
        Project.id == project_id, Project.owner_id == user.id, Project.deleted_at.is_(None),
        detail="Project not found",
    )


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
    fence = (await db.execute(select(ProjectGeofence).where(ProjectGeofence.project_id == project_id))).scalar_one_or_none()
    if fence is None:
        fence = ProjectGeofence(project_id=project_id)
        db.add(fence)
    fence.lat, fence.lng, fence.radius_meters = body.lat, body.lng, body.radius_meters
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
    fence = await get_or_404(db, ProjectGeofence, ProjectGeofence.project_id == project_id, detail="No geofence configured")
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
    fence = await get_or_404(db, ProjectGeofence, ProjectGeofence.project_id == project_id, detail="No geofence configured for this project")

    if not is_within_geofence(body.lat, body.lng, fence.lat, fence.lng, fence.radius_meters):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Location is outside the project geofence")

    # Reject if already checked in (open entry exists).
    open_entry = (await db.execute(select(AttendanceLog).where(
        AttendanceLog.project_id == project_id, AttendanceLog.user_id == user.id, AttendanceLog.checked_out_at.is_(None),
    ))).scalar_one_or_none()
    if open_entry is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already checked in to this project")

    log = AttendanceLog(project_id=project_id, user_id=user.id, checked_in_at=datetime.now(UTC), checkin_lat=body.lat, checkin_lng=body.lng)
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
    log = (await db.execute(select(AttendanceLog).where(
        AttendanceLog.project_id == project_id, AttendanceLog.user_id == user.id, AttendanceLog.checked_out_at.is_(None),
    ))).scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active check-in for this project")

    now = datetime.now(UTC)
    checked_in = log.checked_in_at if log.checked_in_at.tzinfo else log.checked_in_at.replace(tzinfo=UTC)
    log.checked_out_at, log.checkout_lat, log.checkout_lng = now, body.lat, body.lng
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
    logs = (await db.execute(select(AttendanceLog).where(AttendanceLog.project_id == project_id).order_by(AttendanceLog.checked_in_at))).scalars().all()
    return AttendanceListResponse(data=[AttendanceLogResponse.model_validate(e) for e in logs])
