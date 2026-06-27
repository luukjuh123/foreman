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
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

_EXPIRY_WARN_DAYS = 30


async def _get_or_404(db, model, pk_col, pk_val, owner_id, detail):
    return await get_or_404(db, model, pk_col == pk_val, model.owner_id == owner_id, detail=detail)


async def _paginated_list(db, model, response_cls, list_cls, conditions, page, per_page):
    total = (await db.execute(select(func.count()).select_from(model).where(*conditions))).scalar_one()
    rows = (await db.execute(select(model).where(*conditions).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return list_cls(data=[response_cls.model_validate(r) for r in rows], total=total, page=page, per_page=per_page)


async def _save(db, obj, response_cls):
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return response_cls.model_validate(obj)


async def _commit_refresh(db, obj, response_cls):
    await db.commit()
    await db.refresh(obj)
    return response_cls.model_validate(obj)


@router.get("/certifications/expiring", response_model=list[CertificationResponse])
async def list_expiring_certifications(
    days: int = Query(default=_EXPIRY_WARN_DAYS, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CertificationResponse]:
    today = date.today()
    rows = (await db.execute(select(SafetyCertification).where(
        SafetyCertification.owner_id == current_user.id,
        SafetyCertification.expiry_date >= today,
        SafetyCertification.expiry_date <= today + timedelta(days=days),
    ))).scalars().all()
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
    return await _save(db, SafetyCertification(owner_id=current_user.id, status=compute_cert_status(body.expiry_date), **body.model_dump()), CertificationResponse)


@router.get("/certifications/{cert_id}", response_model=CertificationResponse)
async def get_certification(
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    return CertificationResponse.model_validate(await _get_or_404(db, SafetyCertification, SafetyCertification.id, cert_id, current_user.id, "Certification not found"))


@router.put("/certifications/{cert_id}", response_model=CertificationResponse)
async def update_certification(
    cert_id: uuid.UUID,
    body: CertificationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    cert = await _get_or_404(db, SafetyCertification, SafetyCertification.id, cert_id, current_user.id, "Certification not found")
    apply_updates(cert, body)
    if body.expiry_date is not None:
        cert.status = compute_cert_status(cert.expiry_date)
    return await _commit_refresh(db, cert, CertificationResponse)


@router.delete("/certifications/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certification(
    cert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.delete(await _get_or_404(db, SafetyCertification, SafetyCertification.id, cert_id, current_user.id, "Certification not found"))
    await db.commit()


@router.get("/incidents/stats", response_model=IncidentStatsResponse)
async def get_incident_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentStatsResponse:
    rows = (await db.execute(select(SafetyIncident).where(SafetyIncident.owner_id == current_user.id))).scalars().all()
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
    return await _save(db, SafetyIncident(owner_id=current_user.id, **body.model_dump()), IncidentResponse)


@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    return IncidentResponse.model_validate(await _get_or_404(db, SafetyIncident, SafetyIncident.id, incident_id, current_user.id, "Incident not found"))


@router.put("/incidents/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: uuid.UUID,
    body: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = await _get_or_404(db, SafetyIncident, SafetyIncident.id, incident_id, current_user.id, "Incident not found")
    apply_updates(incident, body)
    return await _commit_refresh(db, incident, IncidentResponse)


@router.delete("/incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.delete(await _get_or_404(db, SafetyIncident, SafetyIncident.id, incident_id, current_user.id, "Incident not found"))
    await db.commit()


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
    return await _save(db, RIEChecklist(owner_id=current_user.id, **body.model_dump()), RIEResponse)


@router.get("/rie/{rie_id}", response_model=RIEResponse)
async def get_rie(
    rie_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEResponse:
    return RIEResponse.model_validate(await _get_or_404(db, RIEChecklist, RIEChecklist.id, rie_id, current_user.id, "RI&E checklist not found"))


@router.put("/rie/{rie_id}", response_model=RIEResponse)
async def update_rie(
    rie_id: uuid.UUID,
    body: RIEUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEResponse:
    checklist = await _get_or_404(db, RIEChecklist, RIEChecklist.id, rie_id, current_user.id, "RI&E checklist not found")
    apply_updates(checklist, body)
    return await _commit_refresh(db, checklist, RIEResponse)


@router.delete("/rie/{rie_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rie(
    rie_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.delete(await _get_or_404(db, RIEChecklist, RIEChecklist.id, rie_id, current_user.id, "RI&E checklist not found"))
    await db.commit()


@router.get("/dashboard", response_model=SafetyDashboardResponse)
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SafetyDashboardResponse:
    today = date.today()
    cutoff = today + timedelta(days=_EXPIRY_WARN_DAYS)

    async def _count(model, *filters):
        return (await db.execute(select(func.count()).select_from(model).where(*filters))).scalar_one()

    return SafetyDashboardResponse(
        expiring_certs_count=await _count(SafetyCertification, SafetyCertification.owner_id == current_user.id, SafetyCertification.expiry_date >= today, SafetyCertification.expiry_date <= cutoff),
        open_incidents_count=await _count(SafetyIncident, SafetyIncident.owner_id == current_user.id, SafetyIncident.resolved_at.is_(None)),
        incomplete_checklists_count=await _count(RIEChecklist, RIEChecklist.owner_id == current_user.id, RIEChecklist.completed_at.is_(None)),
    )
