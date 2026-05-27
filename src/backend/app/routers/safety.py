"""Safety & compliance router — certifications, incidents, RI&E, dashboard."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

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
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

_EXPIRY_WARN_DAYS = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_cert_or_404(cert_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> SafetyCertification:
    row = (
        await db.execute(
            select(SafetyCertification).where(
                SafetyCertification.id == cert_id,
                SafetyCertification.owner_id == owner_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certification not found")
    return row


async def _get_incident_or_404(
    incident_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession
) -> SafetyIncident:
    row = (
        await db.execute(
            select(SafetyIncident).where(
                SafetyIncident.id == incident_id,
                SafetyIncident.owner_id == owner_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return row


async def _get_rie_or_404(rie_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> RIEChecklist:
    row = (
        await db.execute(
            select(RIEChecklist).where(
                RIEChecklist.id == rie_id,
                RIEChecklist.owner_id == owner_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RI&E checklist not found")
    return row


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
        await db.execute(
            select(SafetyCertification).where(
                SafetyCertification.owner_id == current_user.id,
                SafetyCertification.expiry_date >= today,
                SafetyCertification.expiry_date <= cutoff,
            )
        )
    ).scalars().all()
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
    conditions = [SafetyCertification.owner_id == current_user.id]
    if staff_id is not None:
        conditions.append(SafetyCertification.staff_id == staff_id)
    if cert_type is not None:
        conditions.append(SafetyCertification.cert_type == cert_type)
    if cert_status is not None:
        conditions.append(SafetyCertification.status == cert_status)

    total = (
        await db.execute(select(func.count()).select_from(SafetyCertification).where(*conditions))
    ).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        await db.execute(
            select(SafetyCertification).where(*conditions).offset(offset).limit(per_page)
        )
    ).scalars().all()

    return CertificationListResponse(
        data=[CertificationResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/certifications/", response_model=CertificationResponse, status_code=status.HTTP_201_CREATED)
async def create_certification(
    body: CertificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CertificationResponse:
    cert_status = compute_cert_status(body.expiry_date)
    cert = SafetyCertification(
        owner_id=current_user.id,
        staff_id=body.staff_id,
        company_wide=body.company_wide,
        cert_type=body.cert_type,
        cert_name=body.cert_name,
        issued_date=body.issued_date,
        expiry_date=body.expiry_date,
        issuing_body=body.issuing_body,
        document_url=body.document_url,
        status=cert_status,
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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cert, field, value)
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
    rows = (
        await db.execute(
            select(SafetyIncident).where(SafetyIncident.owner_id == current_user.id)
        )
    ).scalars().all()

    by_severity: dict[str, int] = {}
    by_project: dict[str, int] = {}
    for inc in rows:
        by_severity[inc.severity] = by_severity.get(inc.severity, 0) + 1
        pid = str(inc.project_id)
        by_project[pid] = by_project.get(pid, 0) + 1

    return IncidentStatsResponse(
        total=len(rows),
        by_severity=by_severity,
        by_project=by_project,
    )


@router.get("/incidents/", response_model=IncidentListResponse)
async def list_incidents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentListResponse:
    conditions = [SafetyIncident.owner_id == current_user.id]
    if project_id is not None:
        conditions.append(SafetyIncident.project_id == project_id)
    if severity is not None:
        conditions.append(SafetyIncident.severity == severity)

    total = (
        await db.execute(select(func.count()).select_from(SafetyIncident).where(*conditions))
    ).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        await db.execute(select(SafetyIncident).where(*conditions).offset(offset).limit(per_page))
    ).scalars().all()

    return IncidentListResponse(
        data=[IncidentResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/incidents/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = SafetyIncident(
        owner_id=current_user.id,
        project_id=body.project_id,
        reported_by_user_id=body.reported_by_user_id,
        incident_date=body.incident_date,
        severity=body.severity,
        description=body.description,
        corrective_action=body.corrective_action,
    )
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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(incident, field, value)
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
    conditions = [RIEChecklist.owner_id == current_user.id]
    if project_id is not None:
        conditions.append(RIEChecklist.project_id == project_id)

    total = (
        await db.execute(select(func.count()).select_from(RIEChecklist).where(*conditions))
    ).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        await db.execute(select(RIEChecklist).where(*conditions).offset(offset).limit(per_page))
    ).scalars().all()

    return RIEListResponse(
        data=[RIEResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/rie/", response_model=RIEResponse, status_code=status.HTTP_201_CREATED)
async def create_rie(
    body: RIECreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RIEResponse:
    checklist = RIEChecklist(
        owner_id=current_user.id,
        project_id=body.project_id,
        template_name=body.template_name,
        items=body.items,
    )
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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(checklist, field, value)
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

    expiring_count = (
        await db.execute(
            select(func.count()).select_from(SafetyCertification).where(
                SafetyCertification.owner_id == current_user.id,
                SafetyCertification.expiry_date >= today,
                SafetyCertification.expiry_date <= cutoff,
            )
        )
    ).scalar_one()

    open_incidents_count = (
        await db.execute(
            select(func.count()).select_from(SafetyIncident).where(
                SafetyIncident.owner_id == current_user.id,
                SafetyIncident.resolved_at.is_(None),
            )
        )
    ).scalar_one()

    incomplete_checklists_count = (
        await db.execute(
            select(func.count()).select_from(RIEChecklist).where(
                RIEChecklist.owner_id == current_user.id,
                RIEChecklist.completed_at.is_(None),
            )
        )
    ).scalar_one()

    return SafetyDashboardResponse(
        expiring_certs_count=expiring_count,
        open_incidents_count=open_incidents_count,
        incomplete_checklists_count=incomplete_checklists_count,
    )
