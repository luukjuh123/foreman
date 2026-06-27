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
from app.routers.deps import get_or_404
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_incident_or_404(incident_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> Incident:
    return await get_or_404(db, Incident, Incident.id == incident_id, Incident.owner_id == owner_id)


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
    for col, val in ((Incident.severity, severity), (Incident.category, category), (Incident.status, status_filter), (Incident.project_id, project_id)):
        if val:
            conditions.append(col == val)

    total = (await db.execute(select(func.count()).select_from(Incident).where(*conditions))).scalar_one()
    incidents = (await db.execute(select(Incident).where(*conditions).offset((page - 1) * per_page).limit(per_page))).scalars().all()

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
    incident = Incident(owner_id=current_user.id, **body.model_dump())
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return IncidentResponse.model_validate(incident)


@router.get("/stats", response_model=IncidentStatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IncidentStatsResponse:
    incidents = (await db.execute(select(Incident).where(Incident.owner_id == current_user.id))).scalars().all()
    return IncidentStatsResponse(
        total_incidents=len(incidents),
        by_severity=dict(Counter(i.severity for i in incidents)),
        by_category=dict(Counter(i.category for i in incidents)),
        total_damage_cost_cents=sum(i.damage_cost_cents for i in incidents),
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
