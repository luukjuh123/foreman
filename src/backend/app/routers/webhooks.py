"""Webhook management router — CRUD for user-configured HTTP callbacks."""

from __future__ import annotations

import uuid

from app.core.database import get_db
from app.models.user import User
from app.models.webhook import Webhook
from app.routers.auth import get_current_user
from app.schemas.webhook import WebhookCreate, WebhookResponse
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.post("/", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Register a new webhook for the authenticated user."""
    webhook = Webhook(
        owner_id=current_user.id,
        url=str(body.url),
        events=",".join(body.events),
        secret=body.secret,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return _to_response(webhook)


@router.get("/", response_model=list[WebhookResponse])
async def list_webhooks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WebhookResponse]:
    """List all webhooks for the authenticated user."""
    result = await db.execute(select(Webhook).where(Webhook.owner_id == current_user.id))
    return [_to_response(w) for w in result.scalars().all()]


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a webhook owned by the authenticated user."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id, Webhook.owner_id == current_user.id))
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    await db.delete(webhook)
    await db.commit()


def _to_response(webhook: Webhook) -> WebhookResponse:
    return WebhookResponse(
        id=webhook.id,
        url=webhook.url,
        events=webhook.events.split(","),
        created_at=webhook.created_at,
    )
