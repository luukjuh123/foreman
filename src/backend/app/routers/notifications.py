"""Notifications router — in-app feed + mark-as-read.

The dispatcher itself is a service used by other modules (project updates,
inbound detection, AI alerts). HTTP surface here is read-only from the
user's perspective.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.notification import (
    NotificationEnvelope,
    NotificationListResponse,
    NotificationPreferencesEnvelope,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationResponse,
)
from app.services.notifications.preferences import get_or_create_preferences

router = APIRouter()


@router.get("/preferences", response_model=NotificationPreferencesEnvelope)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPreferencesEnvelope:
    prefs = await get_or_create_preferences(db, user_id=current_user.id)
    await db.commit()
    await db.refresh(prefs)
    return NotificationPreferencesEnvelope(
        data=NotificationPreferencesResponse.model_validate(prefs)
    )


@router.put("/preferences", response_model=NotificationPreferencesEnvelope)
async def update_preferences(
    payload: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPreferencesEnvelope:
    prefs = await get_or_create_preferences(db, user_id=current_user.id)
    for field in ("in_app_enabled", "email_enabled", "push_enabled", "type_overrides"):
        new_val = getattr(payload, field)
        if new_val is not None:
            setattr(prefs, field, new_val)
    await db.commit()
    await db.refresh(prefs)
    return NotificationPreferencesEnvelope(
        data=NotificationPreferencesResponse.model_validate(prefs)
    )


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    base = select(Notification).where(
        Notification.user_id == current_user.id,
        Notification.deleted_at.is_(None),
    )
    if unread_only:
        base = base.where(Notification.read_at.is_(None))
    base = base.order_by(Notification.created_at.desc())
    offset = (page - 1) * per_page
    rows = (await db.execute(base.offset(offset).limit(per_page))).scalars().all()

    unread = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == current_user.id,
                Notification.deleted_at.is_(None),
                Notification.read_at.is_(None),
            )
        )
    ).scalar_one()

    return NotificationListResponse(
        data=[NotificationResponse.model_validate(n) for n in rows],
        unread_count=unread,
    )


@router.post("/{notification_id}/read", response_model=NotificationEnvelope)
async def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationEnvelope:
    n = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
                Notification.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if n is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(n)
    return NotificationEnvelope(data=NotificationResponse.model_validate(n))
