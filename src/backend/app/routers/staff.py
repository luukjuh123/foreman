"""Staff router — CRUD for employees + availability windows + certifications."""

import uuid
from datetime import UTC, date, datetime, timedelta

from app.core.database import get_db
from app.models.assignment import StaffAssignment
from app.models.staff import Staff, StaffAvailability, StaffCertification
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.staff import (
    CertificationCreate,
    CertificationResponse,
    CertificationUpdate,
    ComplianceOverviewResponse,
    StaffAvailabilityCreate,
    StaffAvailabilityResponse,
    StaffCreate,
    StaffListResponse,
    StaffResponse,
    StaffUpdate,
    StaffUtilizationResponse,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


class StaffUtilizationResponse(BaseModel):
    utilization_rate: float  # 0-100 percent (capped at 100)
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


@router.get("/utilization", response_model=StaffUtilizationResponse)
async def get_staff_utilization(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffUtilizationResponse:
    """Return staff utilization for the current ISO week.

    utilization_percent = (assigned_hours this week) / (total weekly_hours_target for active staff) * 100
    """
    now = datetime.now(UTC)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    available_result = await db.execute(
        select(func.coalesce(func.sum(Staff.weekly_hours_target), 0.0)).where(
            Staff.owner_id == current_user.id,
            Staff.deleted_at.is_(None),
            Staff.active.is_(True),
        )
    )
    available_hours: float = float(available_result.scalar_one())

    assigned_result = await db.execute(
        select(StaffAssignment)
        .join(Staff, StaffAssignment.staff_id == Staff.id)
        .where(
            Staff.owner_id == current_user.id,
            Staff.deleted_at.is_(None),
            StaffAssignment.start_at < week_end,
            StaffAssignment.end_at > week_start,
        )
    )
    assignments = assigned_result.scalars().all()

    assigned_hours = 0.0
    for a in assignments:
        overlap_start = max(a.start_at.replace(tzinfo=UTC) if a.start_at.tzinfo is None else a.start_at, week_start)
        overlap_end = min(a.end_at.replace(tzinfo=UTC) if a.end_at.tzinfo is None else a.end_at, week_end)
        duration_h = (overlap_end - overlap_start).total_seconds() / 3600
        if duration_h > 0:
            assigned_hours += duration_h

    if available_hours > 0:
        utilization_percent = round((assigned_hours / available_hours) * 100, 1)
    else:
        utilization_percent = 0.0

    return StaffUtilizationResponse(
        utilization_percent=utilization_percent,
        assigned_hours=round(assigned_hours, 2),
        available_hours=round(available_hours, 2),
    )


@router.get("/certifications/expiring-soon", response_model=list[CertificationResponse])
async def get_expiring_soon_early(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    """Return certifications expiring within `days` days (not already expired)."""
    today = date.today()
    cutoff = today + timedelta(days=days)

    owned_staff_ids_result = await db.execute(
        select(Staff.id).where(
            Staff.owner_id == current_user.id,
            Staff.deleted_at.is_(None),
        )
    )
    owned_ids = [r[0] for r in owned_staff_ids_result.all()]
    if not owned_ids:
        return []

    result = await db.execute(
        select(StaffCertification).where(
            StaffCertification.staff_id.in_(owned_ids),
            StaffCertification.expires_at > today,
            StaffCertification.expires_at <= cutoff,
        )
    )
    return [CertificationResponse.model_validate(c) for c in result.scalars().all()]


@router.get("/compliance", response_model=ComplianceOverviewResponse)
async def get_compliance_overview_early(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ComplianceOverviewResponse:
    """Return team-wide certification compliance statistics."""
    today = date.today()
    cutoff_30 = today + timedelta(days=30)

    total_staff = (
        await db.execute(
            select(func.count()).select_from(Staff).where(
                Staff.owner_id == current_user.id,
                Staff.deleted_at.is_(None),
            )
        )
    ).scalar_one()

    owned_ids_result = await db.execute(
        select(Staff.id).where(
            Staff.owner_id == current_user.id,
            Staff.deleted_at.is_(None),
        )
    )
    owned_ids = [r[0] for r in owned_ids_result.all()]

    if not owned_ids:
        return ComplianceOverviewResponse(
            total_staff=total_staff,
            total_certifications=0,
            expired_count=0,
            expiring_soon_count=0,
            valid_count=0,
        )

    all_certs_result = await db.execute(
        select(StaffCertification).where(StaffCertification.staff_id.in_(owned_ids))
    )
    all_certs = all_certs_result.scalars().all()

    expired_count = sum(1 for c in all_certs if c.expires_at <= today)
    expiring_soon_count = sum(1 for c in all_certs if today < c.expires_at <= cutoff_30)
    valid_count = sum(1 for c in all_certs if c.expires_at > cutoff_30)

    return ComplianceOverviewResponse(
        total_staff=total_staff,
        total_certifications=len(all_certs),
        expired_count=expired_count,
        expiring_soon_count=expiring_soon_count,
        valid_count=valid_count,
    )


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


# ---------------------------------------------------------------------------
# Certification per-staff CRUD
# ---------------------------------------------------------------------------


@router.get("/{staff_id}/certifications", response_model=list[CertificationResponse])
async def list_certifications(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(StaffCertification)
        .where(StaffCertification.staff_id == staff_id)
        .order_by(StaffCertification.expires_at.asc())
    )
    return [CertificationResponse.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/{staff_id}/certifications",
    response_model=CertificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_certification(
    staff_id: uuid.UUID,
    body: CertificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    cert = StaffCertification(
        staff_id=staff_id,
        cert_type=body.cert_type,
        cert_name=body.cert_name,
        issued_at=body.issued_at,
        expires_at=body.expires_at,
        document_path=body.document_path,
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return CertificationResponse.model_validate(cert)


@router.get("/{staff_id}/certifications/{cert_id}", response_model=CertificationResponse)
async def get_certification(
    staff_id: uuid.UUID,
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(StaffCertification).where(
            StaffCertification.id == cert_id,
            StaffCertification.staff_id == staff_id,
        )
    )
    cert = result.scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certification not found")
    return CertificationResponse.model_validate(cert)


@router.put("/{staff_id}/certifications/{cert_id}", response_model=CertificationResponse)
async def update_certification(
    staff_id: uuid.UUID,
    cert_id: uuid.UUID,
    body: CertificationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(StaffCertification).where(
            StaffCertification.id == cert_id,
            StaffCertification.staff_id == staff_id,
        )
    )
    cert = result.scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certification not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cert, field, value)
    await db.commit()
    await db.refresh(cert)
    return CertificationResponse.model_validate(cert)


@router.delete("/{staff_id}/certifications/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certification(
    staff_id: uuid.UUID,
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(StaffCertification).where(
            StaffCertification.id == cert_id,
            StaffCertification.staff_id == staff_id,
        )
    )
    cert = result.scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certification not found")
    await db.delete(cert)
    await db.commit()
