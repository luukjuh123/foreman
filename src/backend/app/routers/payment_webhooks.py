"""Payment webhook router — Mollie invoice payment reconciliation.

POST /api/webhooks/mollie/invoices
  Receives Mollie payment notifications for invoices.
  Verifies signature, parses payload, and runs reconciliation.

GET /api/invoices/payments/unmatched
  Lists payments that could not be auto-matched to an invoice.
  Requires auth — returns paginated results.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from app.core.database import get_db
from app.models.payment_reconciliation import UnmatchedPayment
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.billing.providers import PaymentProvider, get_payment_provider
from app.services.invoices.reconciliation import reconcile_payment
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ReconcileWebhookResponse(BaseModel):
    matched: bool
    invoice_id: str | None = None
    mollie_payment_id: str


class UnmatchedPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mollie_payment_id: str
    amount_cents: int
    reference: str | None
    received_at: datetime


class UnmatchedPaymentListResponse(BaseModel):
    data: list[UnmatchedPaymentResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# Webhook endpoint — no auth, verified by HMAC signature
# ---------------------------------------------------------------------------


def _euros_to_cents(value_str: str) -> int:
    """Convert Mollie amount string like '121.00' to integer cents (12100)."""
    try:
        return round(float(value_str) * 100)
    except (ValueError, TypeError):
        return 0


@router.post("/webhooks/mollie/invoices", response_model=ReconcileWebhookResponse)
async def mollie_invoice_webhook(
    request: Request,
    x_mollie_signature: str | None = Header(default=None, alias="X-Mollie-Signature"),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
) -> ReconcileWebhookResponse:
    """Receive a Mollie payment notification and auto-reconcile against invoices."""
    body = await request.body()
    if not x_mollie_signature or not provider.verify_webhook_signature(body, x_mollie_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    try:
        payload = json.loads(body.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed JSON payload",
        ) from exc

    mollie_payment_id: str = payload.get("id", "")
    if not mollie_payment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing payment id in payload",
        )

    amount_obj = payload.get("amount", {})
    amount_cents = _euros_to_cents(amount_obj.get("value", "0"))
    reference: str | None = payload.get("description") or None

    matched, invoice = await reconcile_payment(
        db,
        mollie_payment_id=mollie_payment_id,
        amount_cents=amount_cents,
        reference=reference,
        raw_payload=body.decode()[:4000],
    )

    return ReconcileWebhookResponse(
        matched=matched,
        invoice_id=str(invoice.id) if invoice else None,
        mollie_payment_id=mollie_payment_id,
    )


# ---------------------------------------------------------------------------
# Unmatched payments listing — requires auth
# ---------------------------------------------------------------------------


@router.get("/invoices/payments/unmatched", response_model=UnmatchedPaymentListResponse)
async def list_unmatched_payments(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnmatchedPaymentListResponse:
    """List payments that could not be auto-matched to an invoice."""
    offset = (page - 1) * per_page

    count_result = await db.execute(select(func.count()).select_from(UnmatchedPayment))
    total = count_result.scalar_one()

    result = await db.execute(
        select(UnmatchedPayment).order_by(UnmatchedPayment.received_at.desc()).offset(offset).limit(per_page)
    )
    records = result.scalars().all()

    return UnmatchedPaymentListResponse(
        data=[UnmatchedPaymentResponse.model_validate(r) for r in records],
        total=total,
        page=page,
        per_page=per_page,
    )
