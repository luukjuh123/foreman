"""Incidents router — CRUD for on-site incident / damage reports."""

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.incident import Incident
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.incident import (
    IncidentCreate,
    IncidentListResponse,
    IncidentResponse,
    IncidentStatsResponse,
    IncidentUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_incident_or_404(incident_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> Incident:
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.owner_id == owner_id)
    )
    incident = result.scalar_one_or_none()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return incident


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=IncidentListResponse)
async def list_incidents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    severity: str | None = Query(None),
    category: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    project_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentListResponse:
    conditions = [Incident.owner_id == current_user.id]
    if severity:
        conditions.append(Incident.severity == severity)
    if category:
        conditions.append(Incident.category == category)
    if status_filter:
        conditions.append(Incident.status == status_filter)
    if project_id:
        conditions.append(Incident.project_id == project_id)

    offset = (page - 1) * per_page

    count_result = await db.execute(
        select(func.count()).select_from(Incident).where(*conditions)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Incident).where(*conditions).offset(offset).limit(per_page)
    )
    incidents = result.scalars().all()

    return IncidentListResponse(
        data=[IncidentResponse.model_validate(i) for i in incidents],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    body: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = Incident(
        owner_id=current_user.id,
        project_id=body.project_id,
        title=body.title,
        description=body.description,
        severity=body.severity,
        category=body.category,
        incident_date=body.incident_date,
        incident_time=body.incident_time,
        location=body.location,
        reported_by=body.reported_by,
        witnesses=body.witnesses,
        corrective_action=body.corrective_action,
        damage_cost_cents=body.damage_cost_cents,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return IncidentResponse.model_validate(incident)


@router.get("/stats", response_model=IncidentStatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentStatsResponse:
    result = await db.execute(
        select(Incident).where(Incident.owner_id == current_user.id)
    )
    incidents = result.scalars().all()

    by_severity: dict[str, int] = {}
    by_category: dict[str, int] = {}
    total_damage = 0

    for inc in incidents:
        by_severity[inc.severity] = by_severity.get(inc.severity, 0) + 1
        by_category[inc.category] = by_category.get(inc.category, 0) + 1
        total_damage += inc.damage_cost_cents

    return IncidentStatsResponse(
        total_incidents=len(incidents),
        by_severity=by_severity,
        by_category=by_category,
        total_damage_cost_cents=total_damage,
    )


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = await _get_incident_or_404(incident_id, current_user.id, db)
    return IncidentResponse.model_validate(incident)


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: uuid.UUID,
    body: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    incident = await _get_incident_or_404(incident_id, current_user.id, db)

    update_data = body.model_dump(exclude_unset=True)

    # Auto-set resolved_at when status transitions to resolved
    if update_data.get("status") == "resolved" and incident.status != "resolved":
        update_data.setdefault("resolved_at", datetime.now(UTC))

    for field, value in update_data.items():
        setattr(incident, field, value)

    await db.commit()
    await db.refresh(incident)
    return IncidentResponse.model_validate(incident)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident(
    incident_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    incident = await _get_incident_or_404(incident_id, current_user.id, db)
    await db.delete(incident)
    await db.commit()
