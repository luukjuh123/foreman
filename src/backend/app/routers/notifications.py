"""Notifications router — in-app feed + mark-as-read + customer triggers.

The dispatcher itself is a service used by other modules (project updates,
inbound detection, AI alerts). HTTP surface here covers (a) the read-only
in-app feed for the current user and (b) explicit customer-notification
triggers used by upstream business logic (or tests) to send templated
project/invoice/report emails.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

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
from app.services.notifications.customer_emails import (
    notify_invoice_sent,
    notify_project_update,
    notify_report_ready,
)
from app.services.notifications.dispatcher_dep import get_default_dispatcher
from app.services.notifications.engine import NotificationDispatcher
from app.services.notifications.preferences import get_or_create_preferences
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/preferences", response_model=NotificationPreferencesEnvelope)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPreferencesEnvelope:
    prefs = await get_or_create_preferences(db, user_id=current_user.id)
    await db.commit()
    await db.refresh(prefs)
    return NotificationPreferencesEnvelope(data=NotificationPreferencesResponse.model_validate(prefs))


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
    return NotificationPreferencesEnvelope(data=NotificationPreferencesResponse.model_validate(prefs))


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(n)
    return NotificationEnvelope(data=NotificationResponse.model_validate(n))


# ---------------------------------------------------------------------------
# Customer notification triggers
# ---------------------------------------------------------------------------


class ProjectUpdateRequest(BaseModel):
    customer_user_id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    update_summary: str


class InvoiceSentRequest(BaseModel):
    customer_user_id: uuid.UUID
    invoice_id: uuid.UUID
    invoice_number: str
    amount_cents: int


class ReportReadyRequest(BaseModel):
    customer_user_id: uuid.UUID
    report_id: uuid.UUID
    report_url: str
    report_title: str


async def _assert_recipient_exists(user_id: uuid.UUID, db: AsyncSession) -> None:
    exists = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient user not found")


@router.post(
    "/customer/project-update",
    response_model=NotificationEnvelope,
    status_code=status.HTTP_201_CREATED,
)
async def post_project_update(
    body: ProjectUpdateRequest,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dispatcher: NotificationDispatcher = Depends(get_default_dispatcher),
) -> NotificationEnvelope:
    await _assert_recipient_exists(body.customer_user_id, db)
    n = await notify_project_update(
        db,
        dispatcher,
        user_id=body.customer_user_id,
        project_id=body.project_id,
        project_name=body.project_name,
        update_summary=body.update_summary,
    )
    return NotificationEnvelope(data=NotificationResponse.model_validate(n))


@router.post(
    "/customer/invoice-sent",
    response_model=NotificationEnvelope,
    status_code=status.HTTP_201_CREATED,
)
async def post_invoice_sent(
    body: InvoiceSentRequest,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dispatcher: NotificationDispatcher = Depends(get_default_dispatcher),
) -> NotificationEnvelope:
    await _assert_recipient_exists(body.customer_user_id, db)
    try:
        n = await notify_invoice_sent(
            db,
            dispatcher,
            user_id=body.customer_user_id,
            invoice_id=body.invoice_id,
            invoice_number=body.invoice_number,
            amount_cents=body.amount_cents,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return NotificationEnvelope(data=NotificationResponse.model_validate(n))


@router.post(
    "/customer/report-ready",
    response_model=NotificationEnvelope,
    status_code=status.HTTP_201_CREATED,
)
async def post_report_ready(
    body: ReportReadyRequest,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dispatcher: NotificationDispatcher = Depends(get_default_dispatcher),
) -> NotificationEnvelope:
    await _assert_recipient_exists(body.customer_user_id, db)
    n = await notify_report_ready(
        db,
        dispatcher,
        user_id=body.customer_user_id,
        report_id=body.report_id,
        report_url=body.report_url,
        report_title=body.report_title,
    )
    return NotificationEnvelope(data=NotificationResponse.model_validate(n))
