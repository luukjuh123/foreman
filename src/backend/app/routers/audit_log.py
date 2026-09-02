"""Audit log router — list audit entries for authenticated users."""

import uuid

from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
async def list_audit_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """List audit entries for the current user (actor), paginated."""
    conditions = [AuditLog.user_id == current_user.id]
    offset = (page - 1) * per_page

    count_result = await db.execute(select(func.count()).select_from(AuditLog).where(*conditions))
    total = count_result.scalar_one()

    result = await db.execute(
        select(AuditLog).where(*conditions).order_by(AuditLog.created_at.desc()).offset(offset).limit(per_page)
    )
    entries = result.scalars().all()

    return AuditLogListResponse(
        data=[AuditLogResponse.from_orm_entry(e) for e in entries],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{entity_type}/{entity_id}", response_model=AuditLogListResponse)
async def get_entity_audit_trail(
    entity_type: str,
    entity_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """Audit trail for a specific entity, scoped to the current user as actor."""
    conditions = [
        AuditLog.user_id == current_user.id,
        AuditLog.entity_type == entity_type,
        AuditLog.entity_id == entity_id,
    ]
    offset = (page - 1) * per_page

    count_result = await db.execute(select(func.count()).select_from(AuditLog).where(*conditions))
    total = count_result.scalar_one()

    result = await db.execute(
        select(AuditLog).where(*conditions).order_by(AuditLog.created_at.desc()).offset(offset).limit(per_page)
    )
    entries = result.scalars().all()

    return AuditLogListResponse(
        data=[AuditLogResponse.from_orm_entry(e) for e in entries],
        total=total,
        page=page,
        per_page=per_page,
    )
