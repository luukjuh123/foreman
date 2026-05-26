"""Staff router — CRUD for employees + availability windows."""

import uuid
from datetime import UTC, datetime, timedelta

from app.core.database import get_db
from app.models.assignment import StaffAssignment
from app.models.staff import Staff, StaffAvailability
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.staff import (
    StaffAvailabilityCreate,
    StaffAvailabilityResponse,
    StaffCreate,
    StaffListResponse,
    StaffResponse,
    StaffUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


class StaffUtilizationResponse(BaseModel):
    utilization_rate: float  # 0–100 percent (capped at 100)
    assigned_hours: float
    available_hours: float


async def _get_owned_staff_or_404(staff_id: uuid.UUID, user: User, db: AsyncSession) -> Staff:
    result = await db.execute(
        select(Staff)
        .where(
            Staff.id == staff_id,
            Staff.owner_id == user.id,
            Staff.deleted_at.is_(None),
        )
        .options(selectinload(Staff.availability))
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return staff


def _monday_of_week(dt: datetime) -> datetime:
    """Return the Monday 00:00:00 UTC of the week containing `dt`."""
    return (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/utilization", response_model=StaffUtilizationResponse)
async def staff_utilization(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffUtilizationResponse:
    """Return the staff utilization rate for the current calendar week.

    utilization_rate = (assigned_hours / available_hours) × 100, capped at 100%.
    available_hours = sum of weekly_hours_target for all active staff.
    assigned_hours = sum of hours of assignments overlapping this Mon–Sun.
    """
    now = datetime.now(UTC)
    week_start = _monday_of_week(now)
    week_end = week_start + timedelta(days=7)

    # Total available hours: sum of weekly_hours_target for active staff owned by user.
    available_result = await db.execute(
        select(func.sum(Staff.weekly_hours_target)).where(
            Staff.owner_id == current_user.id,
            Staff.deleted_at.is_(None),
            Staff.active.is_(True),
        )
    )
    available_hours: float = float(available_result.scalar_one() or 0.0)

    if available_hours == 0.0:
        return StaffUtilizationResponse(
            utilization_rate=0.0,
            assigned_hours=0.0,
            available_hours=0.0,
        )

    # Fetch assignments that overlap the current week for staff owned by user.
    owned_staff_ids_result = await db.execute(
        select(Staff.id).where(
            Staff.owner_id == current_user.id,
            Staff.deleted_at.is_(None),
            Staff.active.is_(True),
        )
    )
    owned_staff_ids = [row[0] for row in owned_staff_ids_result.all()]

    if not owned_staff_ids:
        return StaffUtilizationResponse(
            utilization_rate=0.0,
            assigned_hours=0.0,
            available_hours=available_hours,
        )

    assignments_result = await db.execute(
        select(StaffAssignment).where(
            StaffAssignment.staff_id.in_(owned_staff_ids),
            and_(
                StaffAssignment.start_at < week_end,
                StaffAssignment.end_at > week_start,
            ),
        )
    )
    assignments = assignments_result.scalars().all()

    # Clamp each assignment to the week window and sum hours.
    # SQLite returns naive datetimes; ensure comparison uses consistent tzinfo.
    def _ensure_utc(dt: datetime) -> datetime:
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)

    assigned_hours: float = 0.0
    for asgn in assignments:
        asgn_start = _ensure_utc(asgn.start_at)
        asgn_end = _ensure_utc(asgn.end_at)
        overlap_start = max(asgn_start, week_start)
        overlap_end = min(asgn_end, week_end)
        if overlap_end > overlap_start:
            assigned_hours += (overlap_end - overlap_start).total_seconds() / 3600.0

    utilization_rate = min(100.0, (assigned_hours / available_hours) * 100.0)

    return StaffUtilizationResponse(
        utilization_rate=round(utilization_rate, 2),
        assigned_hours=round(assigned_hours, 2),
        available_hours=round(available_hours, 2),
    )


@router.get("/", response_model=StaffListResponse)
async def list_staff(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffListResponse:
    offset = (page - 1) * per_page
    count = (
        await db.execute(
            select(func.count()).select_from(Staff).where(Staff.owner_id == current_user.id, Staff.deleted_at.is_(None))
        )
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(Staff)
                .where(Staff.owner_id == current_user.id, Staff.deleted_at.is_(None))
                .options(selectinload(Staff.availability))
                .order_by(Staff.created_at.asc())
                .offset(offset)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return StaffListResponse(
        data=[StaffResponse.model_validate(s) for s in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    staff = Staff(
        owner_id=current_user.id,
        full_name=body.full_name,
        role=body.role,
        email=body.email,
        phone=body.phone,
        hourly_rate_cents=body.hourly_rate_cents,
        weekly_hours_target=body.weekly_hours_target,
        active=body.active,
    )
    db.add(staff)
    await db.commit()
    result = await db.execute(select(Staff).where(Staff.id == staff.id).options(selectinload(Staff.availability)))
    return StaffResponse.model_validate(result.scalar_one())


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    return StaffResponse.model_validate(staff)


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: uuid.UUID,
    body: StaffUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(staff, field, value)
    await db.commit()
    result = await db.execute(select(Staff).where(Staff.id == staff.id).options(selectinload(Staff.availability)))
    return StaffResponse.model_validate(result.scalar_one())


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    staff.deleted_at = datetime.now(UTC)
    await db.commit()


@router.post(
    "/{staff_id}/availability",
    response_model=StaffAvailabilityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_availability(
    staff_id: uuid.UUID,
    body: StaffAvailabilityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffAvailabilityResponse:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    window = StaffAvailability(
        staff_id=staff.id,
        day_of_week=body.day_of_week,
        start_time=body.start_time,
        end_time=body.end_time,
    )
    db.add(window)
    await db.commit()
    await db.refresh(window)
    return StaffAvailabilityResponse.model_validate(window)


@router.delete(
    "/{staff_id}/availability/{availability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_availability(
    staff_id: uuid.UUID,
    availability_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(StaffAvailability).where(
            StaffAvailability.id == availability_id,
            StaffAvailability.staff_id == staff_id,
        )
    )
    window = result.scalar_one_or_none()
    if window is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Availability window not found")
    await db.delete(window)
    await db.commit()
