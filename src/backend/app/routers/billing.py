"""Billing router — subscription views, checkout, and provider webhooks."""

from app.core.database import get_db
from app.models.subscription import (
    TIER_PROJECT_LIMIT,
    Subscription,
    SubscriptionStatus,
    SubscriptionTier,
)
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.billing import SubscriptionResponse, UsageResponse
from app.services.billing.providers import PaymentProvider, get_payment_provider
from app.services.billing.subscriptions import ensure_free_subscription
from app.services.billing.usage import get_or_create_counter
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

# Tier pricing in euro cents per month.
TIER_PRICE_CENTS = {
    SubscriptionTier.STARTER: 999,
    SubscriptionTier.PRO: 2999,
}


class CheckoutRequest(BaseModel):
    tier: SubscriptionTier


class CheckoutResponse(BaseModel):
    checkout_url: str
    provider_subscription_id: str


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionResponse:
    sub = await ensure_free_subscription(current_user.id, db)
    await db.commit()
    await db.refresh(sub)
    return SubscriptionResponse.model_validate(sub)


@router.get("/usage", response_model=UsageResponse)
async def get_my_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UsageResponse:
    counter = await get_or_create_counter(current_user.id, db)
    await db.commit()
    await db.refresh(counter)
    return UsageResponse.model_validate(counter)


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
) -> CheckoutResponse:
    if body.tier == SubscriptionTier.FREE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot checkout for the free tier",
        )
    amount = TIER_PRICE_CENTS[body.tier]
    sub = await ensure_free_subscription(current_user.id, db)
    result = provider.create_subscription(
        customer_email=current_user.email,
        tier=body.tier.value,
        amount_cents=amount,
    )
    # Record the intent on the subscription row; the webhook activates it.
    sub.provider = "mollie"
    sub.provider_subscription_id = result.provider_subscription_id
    sub.provider_customer_id = result.provider_customer_id
    sub.tier = body.tier.value
    sub.status = SubscriptionStatus.PAST_DUE.value  # pending activation
    await db.commit()
    return CheckoutResponse(
        checkout_url=result.checkout_url,
        provider_subscription_id=result.provider_subscription_id,
    )


@router.post("/webhook/mollie")
async def mollie_webhook(
    request: Request,
    x_mollie_signature: str | None = Header(default=None, alias="X-Mollie-Signature"),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
) -> dict:
    body = await request.body()
    if not x_mollie_signature or not provider.verify_webhook_signature(body, x_mollie_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )
    event = provider.parse_webhook(body)
    result = await db.execute(
        select(Subscription).where(Subscription.provider_subscription_id == event.provider_subscription_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        # Unknown subscription — acknowledge so Mollie does not retry forever.
        return {"data": {"acknowledged": True}, "error": None}

    if event.status == "active":
        sub.status = SubscriptionStatus.ACTIVE.value
        try:
            tier = SubscriptionTier(sub.tier)
        except ValueError:
            tier = SubscriptionTier.STARTER
        sub.project_limit = TIER_PROJECT_LIMIT[tier]
    elif event.status == "cancelled":
        sub.status = SubscriptionStatus.CANCELLED.value
        sub.tier = SubscriptionTier.FREE.value
        sub.project_limit = TIER_PROJECT_LIMIT[SubscriptionTier.FREE]
    elif event.status == "past_due":
        sub.status = SubscriptionStatus.PAST_DUE.value
    elif event.status == "trialing":
        sub.status = SubscriptionStatus.TRIALING.value
    await db.commit()
    return {"data": {"acknowledged": True}, "error": None}
