"""Payroll router — time entries + gross salary summary per period."""

import uuid
from datetime import date

from app.core.database import get_db
from app.models.payroll import TimeEntry
from app.models.staff import Staff
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.payroll import (
    PayrollProjectBreakdown,
    PayrollSummary,
    TimeEntryCreate,
    TimeEntryResponse,
)
from app.services.payroll.calculator import _Entry, summarize
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_owned_staff(staff_id: uuid.UUID, user: User, db: AsyncSession) -> Staff:
    result = await db.execute(
        select(Staff).where(
            Staff.id == staff_id,
            Staff.owner_id == user.id,
            Staff.deleted_at.is_(None),
        )
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return staff


@router.post("/time-entries", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    body: TimeEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryResponse:
    staff = await _get_owned_staff(body.staff_id, current_user, db)
    entry = TimeEntry(
        staff_id=staff.id,
        project_id=body.project_id,
        task_id=body.task_id,
        work_date=body.work_date,
        hours=body.hours,
        hourly_rate_cents_snapshot=staff.hourly_rate_cents,
        notes=body.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimeEntryResponse.model_validate(entry)


@router.get("/staff/{staff_id}/time-entries", response_model=list[TimeEntryResponse])
async def list_time_entries(
    staff_id: uuid.UUID,
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TimeEntryResponse]:
    await _get_owned_staff(staff_id, current_user, db)
    stmt = select(TimeEntry).where(TimeEntry.staff_id == staff_id)
    if period_start is not None:
        stmt = stmt.where(TimeEntry.work_date >= period_start)
    if period_end is not None:
        stmt = stmt.where(TimeEntry.work_date <= period_end)
    stmt = stmt.order_by(TimeEntry.work_date.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [TimeEntryResponse.model_validate(r) for r in rows]


@router.get("/staff/{staff_id}/payroll", response_model=PayrollSummary)
async def payroll_summary(
    staff_id: uuid.UUID,
    period_start: date = Query(...),
    period_end: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PayrollSummary:
    if period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period_end must be on or after period_start",
        )
    await _get_owned_staff(staff_id, current_user, db)
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.staff_id == staff_id,
            TimeEntry.work_date >= period_start,
            TimeEntry.work_date <= period_end,
        )
    )
    rows = result.scalars().all()
    entries = [
        _Entry(
            project_id=r.project_id,
            hours=r.hours,
            hourly_rate_cents_snapshot=r.hourly_rate_cents_snapshot,
        )
        for r in rows
    ]
    total_hours, total_gross, breakdown = summarize(entries)
    return PayrollSummary(
        staff_id=staff_id,
        period_start=period_start,
        period_end=period_end,
        total_hours=total_hours,
        gross_cents=total_gross,
        by_project=[
            PayrollProjectBreakdown(project_id=pid, hours=h, gross_cents=g) for pid, (h, g) in breakdown.items()
        ],
    )
