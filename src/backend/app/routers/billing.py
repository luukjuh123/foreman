"""Billing router — subscription views."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.billing import SubscriptionResponse
from app.services.billing.subscriptions import ensure_free_subscription

router = APIRouter()


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    """Return the current user's subscription, provisioning a free plan if missing."""
    sub = await ensure_free_subscription(current_user.id, db)
    await db.commit()
    await db.refresh(sub)
    return SubscriptionResponse.model_validate(sub)
