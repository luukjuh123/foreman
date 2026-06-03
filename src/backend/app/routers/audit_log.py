"""Audit log router — read-only list of user actions."""

from datetime import datetime

from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/", response_model=AuditLogListResponse)
async def list_audit_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    offset = (page - 1) * per_page

    filters = [AuditLog.user_id == current_user.id]
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if date_from:
        filters.append(AuditLog.created_at >= date_from)
    if date_to:
        filters.append(AuditLog.created_at <= date_to)

    count_result = await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    total = count_result.scalar_one()

    result = await db.execute(
        select(AuditLog).where(*filters).order_by(AuditLog.created_at.desc()).offset(offset).limit(per_page)
    )
    entries = result.scalars().all()

    return AuditLogListResponse(
        data=[AuditLogResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        per_page=per_page,
    )
