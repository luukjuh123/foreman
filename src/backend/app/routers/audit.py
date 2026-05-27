"""Audit log router — read-only endpoints for audit log entries."""

import uuid

from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resource_type: str | None = Query(None),
    action: str | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    filters = []
    if resource_type is not None:
        filters.append(AuditLog.resource_type == resource_type)
    if action is not None:
        filters.append(AuditLog.action == action)
    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)

    count = (await db.execute(select(func.count()).select_from(AuditLog).where(*filters))).scalar_one()

    rows = (
        (
            await db.execute(
                select(AuditLog)
                .where(*filters)
                .order_by(AuditLog.timestamp.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    return AuditLogListResponse(
        data=[AuditLogResponse.model_validate(r) for r in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


@router.get("/{entry_id}", response_model=AuditLogResponse)
async def get_audit_log(
    entry_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogResponse:
    result = await db.execute(select(AuditLog).where(AuditLog.id == entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log entry not found")
    return AuditLogResponse.model_validate(entry)
