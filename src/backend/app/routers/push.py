"""Push notification router — subscribe, unsubscribe, VAPID public key."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.push_subscription import (
    PushSubscribeRequest,
    PushSubscriptionResponse,
    PushUnsubscribeRequest,
    VapidKeyResponse,
)

router = APIRouter()


@router.get("/vapid-key", response_model=VapidKeyResponse)
async def get_vapid_key() -> VapidKeyResponse:
    """Return the VAPID public key. No auth required — browsers need this to subscribe."""
    return VapidKeyResponse(public_key=settings.vapid_public_key)


@router.post("/subscribe", response_model=PushSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PushSubscriptionResponse:
    """Save (or update) a Web Push subscription for the authenticated user."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    sub = result.scalar_one_or_none()

    if sub is None:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        )
        db.add(sub)
    else:
        # Upsert: refresh keys in case the browser rotated them
        sub.p256dh = body.keys.p256dh
        sub.auth = body.keys.auth

    await db.commit()
    await db.refresh(sub)
    return PushSubscriptionResponse.model_validate(sub)


@router.delete("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Remove a Web Push subscription. Idempotent — 204 even if not found."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    sub = result.scalar_one_or_none()
    if sub is not None:
        await db.delete(sub)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
