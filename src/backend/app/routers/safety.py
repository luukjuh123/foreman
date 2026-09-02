from __future__ import annotations

import uuid
from collections import Counter
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
from app.routers.deps import add_commit_refresh_validate, apply_updates, commit_refresh_validate, get_or_404
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
_EXPIRY_WARN_DAYS = 30
_U = Depends(get_current_user)
_DB = Depends(get_db)


async def _get(db, model, pk, uid, detail):
    return await get_or_404(db, model, model.id == pk, model.owner_id == uid, detail=detail)


async def _paginated(db, model, resp, lst, conditions, page, per_page):
    total = (await db.execute(select(func.count()).select_from(model).where(*conditions))).scalar_one()
    rows = (await db.execute(select(model).where(*conditions).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return lst(data=[resp.model_validate(r) for r in rows], total=total, page=page, per_page=per_page)


def _filters(model, owner_id, pairs):
    return [model.owner_id == owner_id] + [col == val for col, val in pairs if val is not None]


@router.get("/certifications/expiring", response_model=list[CertificationResponse])
async def list_expiring_certifications(
    days: int = Query(default=_EXPIRY_WARN_DAYS, ge=1, le=365),
    current_user: User = _U, db: AsyncSession = _DB,
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
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    staff_id: uuid.UUID | None = Query(default=None),
    cert_type: str | None = Query(default=None),
    cert_status: str | None = Query(default=None),
    current_user: User = _U, db: AsyncSession = _DB,
) -> CertificationListResponse:
    return await _paginated(db, SafetyCertification, CertificationResponse, CertificationListResponse,
        _filters(SafetyCertification, current_user.id, [(SafetyCertification.staff_id, staff_id), (SafetyCertification.cert_type, cert_type), (SafetyCertification.status, cert_status)]),
        page, per_page)


@router.post("/certifications/", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def create_certification(body: CertificationCreate, current_user: User = _U, db: AsyncSession = _DB) -> CertificationResponse:
    return await add_commit_refresh_validate(db, SafetyCertification(owner_id=current_user.id, status=compute_cert_status(body.expiry_date), **body.model_dump()), CertificationResponse)


@router.get("/certifications/{cert_id}", response_model=CertificationResponse)
async def get_certification(cert_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> CertificationResponse:
    return CertificationResponse.model_validate(await _get(db, SafetyCertification, cert_id, current_user.id, "Certification not found"))


@router.put("/certifications/{cert_id}", response_model=CertificationResponse)
async def update_certification(cert_id: uuid.UUID, body: CertificationUpdate, current_user: User = _U, db: AsyncSession = _DB) -> CertificationResponse:
    cert = await _get(db, SafetyCertification, cert_id, current_user.id, "Certification not found")
    apply_updates(cert, body)
    if body.expiry_date is not None:
        cert.status = compute_cert_status(cert.expiry_date)
    return await commit_refresh_validate(db, cert, CertificationResponse)


@router.delete("/certifications/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_certification(cert_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    await db.delete(await _get(db, SafetyCertification, cert_id, current_user.id, "Certification not found"))
    await db.commit()


@router.get("/incidents/stats", response_model=IncidentStatsResponse)
async def get_incident_stats(current_user: User = _U, db: AsyncSession = _DB) -> IncidentStatsResponse:
    rows = (await db.execute(select(SafetyIncident).where(SafetyIncident.owner_id == current_user.id))).scalars().all()
    return IncidentStatsResponse(total=len(rows), by_severity=dict(Counter(i.severity for i in rows)), by_project=dict(Counter(str(i.project_id) for i in rows)))


@router.get("/incidents/", response_model=IncidentListResponse)
async def list_incidents(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    current_user: User = _U, db: AsyncSession = _DB,
) -> IncidentListResponse:
    return await _paginated(db, SafetyIncident, IncidentResponse, IncidentListResponse,
        _filters(SafetyIncident, current_user.id, [(SafetyIncident.project_id, project_id), (SafetyIncident.severity, severity)]),
        page, per_page)


@router.post("/incidents/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(body: IncidentCreate, current_user: User = _U, db: AsyncSession = _DB) -> IncidentResponse:
    return await add_commit_refresh_validate(db, SafetyIncident(owner_id=current_user.id, **body.model_dump()), IncidentResponse)


@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> IncidentResponse:
    return IncidentResponse.model_validate(await _get(db, SafetyIncident, incident_id, current_user.id, "Incident not found"))


@router.put("/incidents/{incident_id}", response_model=IncidentResponse)
async def update_incident(incident_id: uuid.UUID, body: IncidentUpdate, current_user: User = _U, db: AsyncSession = _DB) -> IncidentResponse:
    obj = await _get(db, SafetyIncident, incident_id, current_user.id, "Incident not found")
    apply_updates(obj, body)
    return await commit_refresh_validate(db, obj, IncidentResponse)


@router.delete("/incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(incident_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    await db.delete(await _get(db, SafetyIncident, incident_id, current_user.id, "Incident not found"))
    await db.commit()


@router.get("/rie/", response_model=RIEListResponse)
async def list_rie(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = Query(default=None),
    current_user: User = _U, db: AsyncSession = _DB,
) -> RIEListResponse:
    return await _paginated(db, RIEChecklist, RIEResponse, RIEListResponse,
        _filters(RIEChecklist, current_user.id, [(RIEChecklist.project_id, project_id)]),
        page, per_page)


@router.post("/rie/", response_model=RIEResponse, status_code=status.HTTP_201_CREATED)
async def create_rie(body: RIECreate, current_user: User = _U, db: AsyncSession = _DB) -> RIEResponse:
    return await add_commit_refresh_validate(db, RIEChecklist(owner_id=current_user.id, **body.model_dump()), RIEResponse)


@router.get("/rie/{rie_id}", response_model=RIEResponse)
async def get_rie(rie_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> RIEResponse:
    return RIEResponse.model_validate(await _get(db, RIEChecklist, rie_id, current_user.id, "RI&E checklist not found"))


@router.put("/rie/{rie_id}", response_model=RIEResponse)
async def update_rie(rie_id: uuid.UUID, body: RIEUpdate, current_user: User = _U, db: AsyncSession = _DB) -> RIEResponse:
    obj = await _get(db, RIEChecklist, rie_id, current_user.id, "RI&E checklist not found")
    apply_updates(obj, body)
    return await commit_refresh_validate(db, obj, RIEResponse)


@router.delete("/rie/{rie_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rie(rie_id: uuid.UUID, current_user: User = _U, db: AsyncSession = _DB) -> None:
    await db.delete(await _get(db, RIEChecklist, rie_id, current_user.id, "RI&E checklist not found"))
    await db.commit()


@router.get("/dashboard", response_model=SafetyDashboardResponse)
async def get_dashboard(current_user: User = _U, db: AsyncSession = _DB) -> SafetyDashboardResponse:
    today, uid = date.today(), current_user.id

    async def _c(model, *f):
        return (await db.execute(select(func.count()).select_from(model).where(*f))).scalar_one()

    return SafetyDashboardResponse(
        expiring_certs_count=await _c(SafetyCertification, SafetyCertification.owner_id == uid, SafetyCertification.expiry_date >= today, SafetyCertification.expiry_date <= today + timedelta(days=_EXPIRY_WARN_DAYS)),
        open_incidents_count=await _c(SafetyIncident, SafetyIncident.owner_id == uid, SafetyIncident.resolved_at.is_(None)),
        incomplete_checklists_count=await _c(RIEChecklist, RIEChecklist.owner_id == uid, RIEChecklist.completed_at.is_(None)),
    )
