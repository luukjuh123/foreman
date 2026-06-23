"""Safety & compliance router — certifications, incidents, RI&E, dashboard."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.core.database import get_db
from app.models.safety import RIEChecklist, SafetyCertification, SafetyIncident
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.safety import (
    CertificationCreate,
    CertificationListResponse,
    CertificationResponse,
    CertificationUpdate,
    IncidentCreate,
    IncidentListResponse,
    IncidentResponse,
    IncidentStatsResponse,
    IncidentUpdate,
    RIECreate,
    RIEListResponse,
    RIEResponse,
    RIEUpdate,
    SafetyDashboardResponse,
)
from app.services.safety import compute_cert_status
from app.routers.deps import apply_updates, get_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

_EXPIRY_WARN_DAYS = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_cert_or_404(cert_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> SafetyCertification:
    return await get_or_404(db, SafetyCertification, SafetyCertification.id == cert_id, SafetyCertification.owner_id == owner_id, detail="Certification not found")


async def _get_incident_or_404(incident_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> SafetyIncident:
    return await get_or_404(db, SafetyIncident, SafetyIncident.id == incident_id, SafetyIncident.owner_id == owner_id, detail="Incident not found")


async def _get_rie_or_404(rie_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> RIEChecklist:
    return await get_or_404(db, RIEChecklist, RIEChecklist.id == rie_id, RIEChecklist.owner_id == owner_id, detail="RI&E checklist not found")


async def _paginated_list(db: AsyncSession, model: type, response_cls: type, list_cls: type, conditions: list, page: int, per_page: int):
    """Generic paginated list query: returns list_cls(data=[response_cls(...)], total, page, per_page)."""
    total = (await db.execute(select(func.count()).select_from(model).where(*conditions))).scalar_one()
    rows = (await db.execute(select(model).where(*conditions).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return list_cls(data=[response_cls.model_validate(r) for r in rows], total=total, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# Certifications
# ---------------------------------------------------------------------------


@router.get("/certifications/expiring", response_model=list[CertificationResponse])
async def list_expiring_certifications(
    days: int = Query(default=_EXPIRY_WARN_DAYS, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    """Return certifications expiring within `days` days (not yet expired)."""
    today = date.today()
    cutoff = today + timedelta(days=days)
    rows = (
        (
            await db.execute(
                select(SafetyCertification).where(
                    SafetyCertification.owner_id == current_user.id,
                    SafetyCertification.expiry_date >= today,
                    SafetyCertification.expiry_date <= cutoff,
                )
            )
        )
        .scalars()
        .all()
    )
    return [CertificationResponse.model_validate(r) for r in rows]


@router.get("/certifications/", response_model=CertificationListResponse)
async def list_certifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    staff_id: uuid.UUID | None = Query(default=None),
    cert_type: str | None = Query(default=None),
    cert_status: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationListResponse:
    conditions = [
        SafetyCertification.owner_id == current_user.id,
        *([SafetyCertification.staff_id == staff_id] if staff_id is not None else []),
        *([SafetyCertification.cert_type == cert_type] if cert_type is not None else []),
        *([SafetyCertification.status == cert_status] if cert_status is not None else []),
    ]
    return await _paginated_list(db, SafetyCertification, CertificationResponse, CertificationListResponse, conditions, page, per_page)


@router.post("/certifications/", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def create_certification(
    body: CertificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    cert = SafetyCertification(
        owner_id=current_user.id, **body.model_dump(),
        status=compute_cert_status(body.expiry_date),
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return CertificationResponse.model_validate(cert)


@router.get("/certifications/{cert_id}", response_model=CertificationResponse)
async def get_certification(
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    cert = await _get_cert_or_404(cert_id, current_user.id, db)
    return CertificationResponse.model_validate(cert)


@router.put("/certifications/{cert_id}", response_model=CertificationResponse)
async def update_certification(
    cert_id: uuid.UUID,
    body: CertificationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    cert = await _get_cert_or_404(cert_id, current_user.id, db)
    apply_updates(cert, body)
    # Recompute status if expiry_date changed
    if body.expiry_date is not None:
        cert.status = compute_cert_status(cert.expiry_date)
    await db.commit()
    await db.refresh(cert)
    return CertificationResponse.model_validate(cert)


@router.delete("/certifications/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certification(
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    cert = await _get_cert_or_404(cert_id, current_user.id, db)
    await db.delete(cert)
    await db.commit()


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------


@router.get("/incidents/stats", response_model=IncidentStatsResponse)
async def get_incident_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentStatsResponse:
    rows = list((await db.execute(select(SafetyIncident).where(SafetyIncident.owner_id == current_user.id))).scalars().all())
    by_severity: dict[str, int] = {}
    by_project: dict[str, int] = {}
    for inc in rows:
        by_severity[inc.severity] = by_severity.get(inc.severity, 0) + 1
        by_project[str(inc.project_id)] = by_project.get(str(inc.project_id), 0) + 1
    return IncidentStatsResponse(total=len(rows), by_severity=by_severity, by_project=by_project)


@router.get("/incidents/", response_model=IncidentListResponse)
async def list_incidents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentListResponse:
    conditions = [
        SafetyIncident.owner_id == current_user.id,
        *([SafetyIncident.project_id == project_id] if project_id is not None else []),
        *([SafetyIncident.severity == severity] if severity is not None else []),
    ]
    return await _paginated_list(db, SafetyIncident, IncidentResponse, IncidentListResponse, conditions, page, per_page)


@router.post("/incidents/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = SafetyIncident(owner_id=current_user.id, **body.model_dump())
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return IncidentResponse.model_validate(incident)


@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = await _get_incident_or_404(incident_id, current_user.id, db)
    return IncidentResponse.model_validate(incident)


@router.put("/incidents/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: uuid.UUID,
    body: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = await _get_incident_or_404(incident_id, current_user.id, db)
    apply_updates(incident, body)
    await db.commit()
    await db.refresh(incident)
    return IncidentResponse.model_validate(incident)


@router.delete("/incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    incident = await _get_incident_or_404(incident_id, current_user.id, db)
    await db.delete(incident)
    await db.commit()


# ---------------------------------------------------------------------------
# RI&E Checklists
# ---------------------------------------------------------------------------


@router.get("/rie/", response_model=RIEListResponse)
async def list_rie(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEListResponse:
    conditions = [
        RIEChecklist.owner_id == current_user.id,
        *([RIEChecklist.project_id == project_id] if project_id is not None else []),
    ]
    return await _paginated_list(db, RIEChecklist, RIEResponse, RIEListResponse, conditions, page, per_page)


@router.post("/rie/", response_model=RIEResponse, status_code=status.HTTP_201_CREATED)
async def create_rie(
    body: RIECreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEResponse:
    checklist = RIEChecklist(owner_id=current_user.id, **body.model_dump())
    db.add(checklist)
    await db.commit()
    await db.refresh(checklist)
    return RIEResponse.model_validate(checklist)


@router.get("/rie/{rie_id}", response_model=RIEResponse)
async def get_rie(
    rie_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEResponse:
    checklist = await _get_rie_or_404(rie_id, current_user.id, db)
    return RIEResponse.model_validate(checklist)


@router.put("/rie/{rie_id}", response_model=RIEResponse)
async def update_rie(
    rie_id: uuid.UUID,
    body: RIEUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEResponse:
    checklist = await _get_rie_or_404(rie_id, current_user.id, db)
    apply_updates(checklist, body)
    await db.commit()
    await db.refresh(checklist)
    return RIEResponse.model_validate(checklist)


@router.delete("/rie/{rie_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rie(
    rie_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    checklist = await _get_rie_or_404(rie_id, current_user.id, db)
    await db.delete(checklist)
    await db.commit()


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=SafetyDashboardResponse)
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SafetyDashboardResponse:
    today = date.today()
    cutoff = today + timedelta(days=_EXPIRY_WARN_DAYS)

    async def _count(model: type, *filters: object) -> int:
        return (await db.execute(select(func.count()).select_from(model).where(*filters))).scalar_one()

    return SafetyDashboardResponse(
        expiring_certs_count=await _count(
            SafetyCertification,
            SafetyCertification.owner_id == current_user.id,
            SafetyCertification.expiry_date >= today,
            SafetyCertification.expiry_date <= cutoff,
        ),
        open_incidents_count=await _count(
            SafetyIncident,
            SafetyIncident.owner_id == current_user.id,
            SafetyIncident.resolved_at.is_(None),
        ),
        incomplete_checklists_count=await _count(
            RIEChecklist,
            RIEChecklist.owner_id == current_user.id,
            RIEChecklist.completed_at.is_(None),
        ),
    )
