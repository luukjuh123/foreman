"""Push subscription router — subscribe and unsubscribe endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.push_subscription import (
    PushSubscribeRequest,
    PushSubscriptionResponse,
    PushUnsubscribeRequest,
)

router = APIRouter()


@router.post("/subscribe", response_model=PushSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: PushSubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PushSubscriptionResponse:
    """Upsert a push subscription for the current user."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    sub = result.scalar_one_or_none()

    if sub is None:
        sub = PushSubscription(
            user_id=user.id,
            endpoint=body.endpoint,
            p256dh_key=body.keys.p256dh,
            auth_key=body.keys.auth,
        )
        db.add(sub)
    else:
        sub.p256dh_key = body.keys.p256dh
        sub.auth_key = body.keys.auth

    await db.commit()
    await db.refresh(sub)

    return PushSubscriptionResponse(
        id=str(sub.id),
        endpoint=sub.endpoint,
        created_at=sub.created_at.isoformat(),
    )


@router.delete("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Remove a push subscription by endpoint."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    sub = result.scalar_one_or_none()
    if sub is not None:
        await db.delete(sub)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
