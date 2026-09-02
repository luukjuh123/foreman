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
from app.routers.deps import apply_updates, commit_refresh_validate, ensure_utc, get_or_404
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


async def _refresh_staff(db: AsyncSession, staff_id: uuid.UUID) -> Staff:
    return (await db.execute(select(Staff).where(Staff.id == staff_id).options(selectinload(Staff.availability)))).scalar_one()


async def _commit_refresh_staff(db: AsyncSession, obj, schema: type):
    await db.commit()
    return schema.model_validate(await _refresh_staff(db, obj.id))


@router.get("/utilization", response_model=StaffUtilizationResponse)
async def staff_utilization(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> StaffUtilizationResponse:
    now = datetime.now(UTC)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)
    available_hours = float((await db.execute(
        select(func.coalesce(func.sum(Staff.weekly_hours_target), 0.0)).where(*_OWNER_ACTIVE_ON(current_user))
    )).scalar_one())
    assignments = (await db.execute(
        select(StaffAssignment).join(Staff, StaffAssignment.staff_id == Staff.id)
        .where(*_OWNER_ACTIVE(current_user), StaffAssignment.start_at < week_end, StaffAssignment.end_at > week_start)
    )).scalars().all()
    assigned_hours = sum(
        max(0, (min(ensure_utc(a.end_at), week_end) - max(ensure_utc(a.start_at), week_start)).total_seconds() / 3600)
        for a in assignments
    )
    utilization_percent = round((assigned_hours / available_hours) * 100, 1) if available_hours > 0 else 0.0
    return StaffUtilizationResponse(utilization_percent=utilization_percent, assigned_hours=round(assigned_hours, 2), available_hours=round(available_hours, 2))


@router.get("/", response_model=StaffListResponse)
async def list_staff(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffListResponse:
    base = Staff.owner_id == current_user.id, Staff.deleted_at.is_(None)
    count = (await db.execute(select(func.count()).select_from(Staff).where(*base))).scalar_one()
    rows = (await db.execute(
        select(Staff).where(*base).options(selectinload(Staff.availability))
        .order_by(Staff.created_at.asc()).offset((page - 1) * per_page).limit(per_page)
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
    return await _commit_refresh_staff(db, staff, StaffResponse)


@router.get("/certifications/expiring-soon", response_model=list[CertificationResponse])
async def get_expiring_soon_early(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    today, owned_ids = date.today(), await _owned_staff_ids(current_user, db)
    if not owned_ids:
        return []
    result = await db.execute(select(StaffCertification).where(
        StaffCertification.staff_id.in_(owned_ids), StaffCertification.expires_at > today, StaffCertification.expires_at <= today + timedelta(days=days),
    ))
    return [CertificationResponse.model_validate(c) for c in result.scalars().all()]


@router.get("/compliance", response_model=ComplianceOverviewResponse)
async def get_compliance_overview_early(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> ComplianceOverviewResponse:
    today = date.today()
    cutoff_30 = today + timedelta(days=30)
    total_staff = (await db.execute(select(func.count()).select_from(Staff).where(*_OWNER_ACTIVE(current_user)))).scalar_one()
    owned_ids = await _owned_staff_ids(current_user, db)
    if not owned_ids:
        return ComplianceOverviewResponse(total_staff=total_staff, total_certifications=0, expired_count=0, expiring_soon_count=0, valid_count=0)
    all_certs = (await db.execute(select(StaffCertification).where(StaffCertification.staff_id.in_(owned_ids)))).scalars().all()
    return ComplianceOverviewResponse(
        total_staff=total_staff, total_certifications=len(all_certs),
        expired_count=sum(c.expires_at <= today for c in all_certs),
        expiring_soon_count=sum(today < c.expires_at <= cutoff_30 for c in all_certs),
        valid_count=sum(c.expires_at > cutoff_30 for c in all_certs),
    )


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff(
    staff_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    return StaffResponse.model_validate(await _get_owned_staff_or_404(staff_id, current_user, db))


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: uuid.UUID, body: StaffUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> StaffResponse:
    apply_updates(staff := await _get_owned_staff_or_404(staff_id, current_user, db), body)
    return await _commit_refresh_staff(db, staff, StaffResponse)


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> None:
    (await _get_owned_staff_or_404(staff_id, current_user, db)).deleted_at = datetime.now(UTC)
    await db.commit()


@router.post("/{staff_id}/availability", response_model=StaffAvailabilityResponse, status_code=status.HTTP_201_CREATED)
async def add_availability(
    staff_id: uuid.UUID, body: StaffAvailabilityCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> StaffAvailabilityResponse:
    db.add(window := StaffAvailability(staff_id=(await _get_owned_staff_or_404(staff_id, current_user, db)).id, **body.model_dump()))
    return await commit_refresh_validate(db, window, StaffAvailabilityResponse)


@router.delete("/{staff_id}/availability/{availability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_availability(
    staff_id: uuid.UUID, availability_id: uuid.UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> None:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    await db.delete(await get_or_404(db, StaffAvailability, StaffAvailability.id == availability_id, StaffAvailability.staff_id == staff_id, detail="Availability window not found"))
    await db.commit()


@router.get("/{staff_id}/certifications", response_model=list[CertificationResponse])
async def list_certifications(
    staff_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    rows = (await db.execute(select(StaffCertification).where(StaffCertification.staff_id == staff_id).order_by(StaffCertification.expires_at.asc()))).scalars().all()
    return [CertificationResponse.model_validate(c) for c in rows]


@router.post("/{staff_id}/certifications", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def create_certification(
    staff_id: uuid.UUID, body: CertificationCreate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    db.add(cert := StaffCertification(staff_id=staff_id, **body.model_dump()))
    return await commit_refresh_validate(db, cert, CertificationResponse)


async def _owned_cert(staff_id: uuid.UUID, cert_id: uuid.UUID, current_user: User, db: AsyncSession) -> StaffCertification:
    await _get_owned_staff_or_404(staff_id, current_user, db)
    return await _get_cert_or_404(db, staff_id, cert_id)


@router.get("/{staff_id}/certifications/{cert_id}", response_model=CertificationResponse)
async def get_certification(
    staff_id: uuid.UUID, cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    return CertificationResponse.model_validate(await _owned_cert(staff_id, cert_id, current_user, db))


@router.put("/{staff_id}/certifications/{cert_id}", response_model=CertificationResponse)
async def update_certification(
    staff_id: uuid.UUID, cert_id: uuid.UUID, body: CertificationUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    apply_updates(cert := await _owned_cert(staff_id, cert_id, current_user, db), body)
    return await commit_refresh_validate(db, cert, CertificationResponse)


@router.delete("/{staff_id}/certifications/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certification(
    staff_id: uuid.UUID, cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> None:
    await db.delete(await _owned_cert(staff_id, cert_id, current_user, db))
    await db.commit()
