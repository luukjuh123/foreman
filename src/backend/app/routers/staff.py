"""Staff router — CRUD for employees + availability windows."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
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

router = APIRouter()


async def _get_owned_staff_or_404(
    staff_id: uuid.UUID, user: User, db: AsyncSession
) -> Staff:
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
            select(func.count())
            .select_from(Staff)
            .where(Staff.owner_id == current_user.id, Staff.deleted_at.is_(None))
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(Staff)
            .where(Staff.owner_id == current_user.id, Staff.deleted_at.is_(None))
            .options(selectinload(Staff.availability))
            .order_by(Staff.created_at.asc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()
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
    result = await db.execute(
        select(Staff).where(Staff.id == staff.id).options(selectinload(Staff.availability))
    )
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
    result = await db.execute(
        select(Staff).where(Staff.id == staff.id).options(selectinload(Staff.availability))
    )
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Availability window not found"
        )
    await db.delete(window)
    await db.commit()
