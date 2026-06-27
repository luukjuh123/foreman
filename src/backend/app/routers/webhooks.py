"""Webhook management router — CRUD for user-configured HTTP callbacks."""

from __future__ import annotations

import uuid

from app.core.database import get_db
from app.models.user import User
from app.models.webhook import Webhook
from app.routers.auth import get_current_user
from app.schemas.webhook import WebhookCreate, WebhookResponse, WebhookUpdate
from app.routers.deps import apply_updates, get_or_404
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
        is_active=True,
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


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Get a single webhook owned by the authenticated user."""
    webhook = await _get_owned_webhook(webhook_id, current_user.id, db)
    return _to_response(webhook)


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: uuid.UUID,
    body: WebhookUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Update a webhook owned by the authenticated user."""
    webhook = await _get_owned_webhook(webhook_id, current_user.id, db)
    updates = body.model_dump(exclude_unset=True)
    if "url" in updates:
        updates["url"] = str(updates["url"])
    if "events" in updates:
        updates["events"] = ",".join(updates.pop("events"))
    for k, v in updates.items():
        setattr(webhook, k, v)
    await db.commit()
    await db.refresh(webhook)
    return _to_response(webhook)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a webhook owned by the authenticated user."""
    webhook = await _get_owned_webhook(webhook_id, current_user.id, db)
    await db.delete(webhook)
    await db.commit()


async def _get_owned_webhook(
    webhook_id: uuid.UUID,
    owner_id: uuid.UUID,
    db: AsyncSession,
) -> Webhook:
    return await get_or_404(db, Webhook, Webhook.id == webhook_id, Webhook.owner_id == owner_id)


def _to_response(webhook: Webhook) -> WebhookResponse:
    return WebhookResponse(
        id=webhook.id,
        url=webhook.url,
        events=webhook.events.split(","),
        is_active=webhook.is_active,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )
