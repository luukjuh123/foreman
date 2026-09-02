"""Payroll router — time entries + gross salary summary per period."""

import uuid
from datetime import date

from app.core.database import get_db
from app.models.payroll import TimeEntry
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.deps import get_owned_staff_or_404
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


@router.post("/time-entries", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    body: TimeEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryResponse:
    staff = await get_owned_staff_or_404(body.staff_id, current_user, db)
    entry = TimeEntry(**body.model_dump(exclude={"staff_id"}), staff_id=staff.id, hourly_rate_cents_snapshot=staff.hourly_rate_cents)
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
    await get_owned_staff_or_404(staff_id, current_user, db)
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
    await get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.staff_id == staff_id,
            TimeEntry.work_date >= period_start,
            TimeEntry.work_date <= period_end,
        )
    )
    rows = result.scalars().all()
    entries = [_Entry(r.project_id, r.hours, r.hourly_rate_cents_snapshot) for r in rows]
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
