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
from app.routers.deps import apply_updates, get_or_404
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()

_OWNER_ACTIVE = lambda u: (Staff.owner_id == u.id, Staff.deleted_at.is_(None))
_OWNER_ACTIVE_ON = lambda u: (*_OWNER_ACTIVE(u), Staff.active.is_(True))


async def _get_owned_staff_or_404(staff_id: uuid.UUID, user: User, db: AsyncSession) -> Staff:
    return await get_or_404(
        db, Staff,
        Staff.id == staff_id, Staff.owner_id == user.id, Staff.deleted_at.is_(None),
        options=selectinload(Staff.availability),
    )


async def _owned_staff_ids(user: User, db: AsyncSession, active_only: bool = False) -> list[uuid.UUID]:
    filters = _OWNER_ACTIVE_ON(user) if active_only else _OWNER_ACTIVE(user)
    rows = await db.execute(select(Staff.id).where(*filters))
    return [r[0] for r in rows.all()]


async def _get_cert_or_404(db: AsyncSession, staff_id: uuid.UUID, cert_id: uuid.UUID) -> StaffCertification:
    return await get_or_404(
        db, StaffCertification,
        StaffCertification.id == cert_id, StaffCertification.staff_id == staff_id,
        detail="Certification not found",
    )


def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


async def _refresh_staff(db: AsyncSession, staff_id: uuid.UUID) -> Staff:
    result = await db.execute(select(Staff).where(Staff.id == staff_id).options(selectinload(Staff.availability)))
    return result.scalar_one()



@router.get("/utilization", response_model=StaffUtilizationResponse)
async def staff_utilization(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffUtilizationResponse:
    """Return staff utilization for the current ISO week."""
    now = datetime.now(UTC)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    available_hours = float((await db.execute(
        select(func.coalesce(func.sum(Staff.weekly_hours_target), 0.0)).where(*_OWNER_ACTIVE_ON(current_user))
    )).scalar_one())

    assignments = (await db.execute(
        select(StaffAssignment)
        .join(Staff, StaffAssignment.staff_id == Staff.id)
        .where(*_OWNER_ACTIVE(current_user), StaffAssignment.start_at < week_end, StaffAssignment.end_at > week_start)
    )).scalars().all()

    assigned_hours = 0.0
    for a in assignments:
        h = (min(_ensure_utc(a.end_at), week_end) - max(_ensure_utc(a.start_at), week_start)).total_seconds() / 3600
        if h > 0:
            assigned_hours += h

    utilization_percent = round((assigned_hours / available_hours) * 100, 1) if available_hours > 0 else 0.0
    return StaffUtilizationResponse(
        utilization_percent=utilization_percent,
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
    base = Staff.owner_id == current_user.id, Staff.deleted_at.is_(None)
    count = (await db.execute(select(func.count()).select_from(Staff).where(*base))).scalar_one()
    rows = (await db.execute(
        select(Staff).where(*base).options(selectinload(Staff.availability))
        .order_by(Staff.created_at.asc()).offset(offset).limit(per_page)
    )).scalars().all()
    return StaffListResponse(data=[StaffResponse.model_validate(s) for s in rows], total=count, page=page, per_page=per_page)


@router.post("/", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    staff = Staff(owner_id=current_user.id, **body.model_dump())
    db.add(staff)
    await db.commit()
    return StaffResponse.model_validate(await _refresh_staff(db, staff.id))


@router.get("/certifications/expiring-soon", response_model=list[CertificationResponse])
async def get_expiring_soon_early(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    """Return certifications expiring within `days` days (not already expired)."""
    today, owned_ids = date.today(), await _owned_staff_ids(current_user, db)
    if not owned_ids:
        return []
    cutoff = today + timedelta(days=days)
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
    total_staff = (await db.execute(
        select(func.count()).select_from(Staff).where(*_OWNER_ACTIVE(current_user))
    )).scalar_one()
    owned_ids = await _owned_staff_ids(current_user, db)
    if not owned_ids:
        return ComplianceOverviewResponse(total_staff=total_staff, total_certifications=0, expired_count=0, expiring_soon_count=0, valid_count=0)

    all_certs = (await db.execute(select(StaffCertification).where(StaffCertification.staff_id.in_(owned_ids)))).scalars().all()
    return ComplianceOverviewResponse(
        total_staff=total_staff,
        total_certifications=len(all_certs),
        expired_count=sum(1 for c in all_certs if c.expires_at <= today),
        expiring_soon_count=sum(1 for c in all_certs if today < c.expires_at <= cutoff_30),
        valid_count=sum(1 for c in all_certs if c.expires_at > cutoff_30),
    )


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    return StaffResponse.model_validate(await _get_owned_staff_or_404(staff_id, current_user, db))


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: uuid.UUID,
    body: StaffUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    apply_updates(staff, body)
    await db.commit()
    return StaffResponse.model_validate(await _refresh_staff(db, staff.id))


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    staff.deleted_at = datetime.now(UTC)
    await db.commit()



@router.post("/{staff_id}/availability", response_model=StaffAvailabilityResponse, status_code=status.HTTP_201_CREATED)
async def add_availability(
    staff_id: uuid.UUID,
    body: StaffAvailabilityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffAvailabilityResponse:
    staff = await _get_owned_staff_or_404(staff_id, current_user, db)
    window = StaffAvailability(staff_id=staff.id, **body.model_dump())
    db.add(window)
    await db.commit()
    await db.refresh(window)
    return StaffAvailabilityResponse.model_validate(window)


@router.delete("/{staff_id}/availability/{availability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_availability(
    staff_id: uuid.UUID,
    availability_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    window = await get_or_404(db, StaffAvailability, StaffAvailability.id == availability_id, StaffAvailability.staff_id == staff_id, detail="Availability window not found")
    await db.delete(window)
    await db.commit()


@router.get("/{staff_id}/certifications", response_model=list[CertificationResponse])
async def list_certifications(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    result = await db.execute(
        select(StaffCertification).where(StaffCertification.staff_id == staff_id).order_by(StaffCertification.expires_at.asc())
    )
    return [CertificationResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/{staff_id}/certifications", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def create_certification(
    staff_id: uuid.UUID,
    body: CertificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    cert = StaffCertification(staff_id=staff_id, **body.model_dump())
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
    return CertificationResponse.model_validate(await _get_cert_or_404(db, staff_id, cert_id))


@router.put("/{staff_id}/certifications/{cert_id}", response_model=CertificationResponse)
async def update_certification(
    staff_id: uuid.UUID,
    cert_id: uuid.UUID,
    body: CertificationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    cert = await _get_cert_or_404(db, staff_id, cert_id)
    apply_updates(cert, body)
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
    cert = await _get_cert_or_404(db, staff_id, cert_id)
    await db.delete(cert)
    await db.commit()
