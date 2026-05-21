"""Inbound webhooks — capture customer inquiries from email + web forms.

These endpoints intentionally sit at `/api/inbound/...` (not `/api/v1/...`)
because they are called by external systems (email forwarders, public
website form). They take *no* auth: any traffic that lands here becomes a
lead. Downstream, every admin user is notified so a human can triage.
"""

from __future__ import annotations

from app.core.database import get_db
from app.models.inbound_inquiry import InboundInquiry
from app.models.user import User
from app.schemas.inbound import (
    InboundEmailRequest,
    InboundFormRequest,
    InboundInquiryEnvelope,
    InboundInquiryResponse,
)
from app.services.notifications.dispatcher_dep import get_default_dispatcher
from app.services.notifications.engine import NotificationDispatcher
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _notify_admins(
    db: AsyncSession,
    dispatcher: NotificationDispatcher,
    inquiry: InboundInquiry,
) -> None:
    admins = (
        (await db.execute(select(User).where(User.role == "admin"))).scalars().all()
    )
    for admin in admins:
        subj = inquiry.subject or "(no subject)"
        from_label = inquiry.from_email or "anonymous"
        await dispatcher.dispatch(
            db,
            user_id=admin.id,
            type="inbound.inquiry_received",
            title=f"New {inquiry.source} inquiry: {subj}",
            body=(
                f"You have a new inbound {inquiry.source} inquiry from "
                f"{from_label}. Message: {inquiry.body[:500]}"
            ),
            data={
                "inquiry_id": str(inquiry.id),
                "source": inquiry.source,
                "from_email": inquiry.from_email,
            },
            channels=["in_app", "email"],
        )


@router.post(
    "/email", response_model=InboundInquiryEnvelope, status_code=status.HTTP_201_CREATED
)
async def inbound_email(
    body: InboundEmailRequest,
    db: AsyncSession = Depends(get_db),
    dispatcher: NotificationDispatcher = Depends(get_default_dispatcher),
) -> InboundInquiryEnvelope:
    inquiry = InboundInquiry(
        source="email",
        from_email=body.from_email,
        from_name=body.from_name,
        subject=body.subject,
        body=body.body,
        raw=body.raw,
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    await _notify_admins(db, dispatcher, inquiry)
    return InboundInquiryEnvelope(data=InboundInquiryResponse.model_validate(inquiry))


@router.post(
    "/form", response_model=InboundInquiryEnvelope, status_code=status.HTTP_201_CREATED
)
async def inbound_form(
    body: InboundFormRequest,
    db: AsyncSession = Depends(get_db),
    dispatcher: NotificationDispatcher = Depends(get_default_dispatcher),
) -> InboundInquiryEnvelope:
    inquiry = InboundInquiry(
        source="form",
        from_email=body.email,
        from_name=body.name,
        subject=None,
        body=body.message,
        raw={"phone": body.phone} if body.phone else None,
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    await _notify_admins(db, dispatcher, inquiry)
    return InboundInquiryEnvelope(data=InboundInquiryResponse.model_validate(inquiry))
