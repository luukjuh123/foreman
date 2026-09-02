"""Helpers for notification preferences: fetch/create + channel filtering.

Kept as a separate module so the dispatcher only depends on a small, pure
`allowed_channels_for()` function plus an async `get_or_create_preferences()`
DB helper.
"""

from __future__ import annotations

import uuid

from app.models.notification_preference import NotificationPreference
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ALL_CHANNELS: set[str] = {"in_app", "email", "push"}

_FIELD_FOR_CHANNEL = {
    "in_app": "in_app_enabled",
    "email": "email_enabled",
    "push": "push_enabled",
}


async def get_or_create_preferences(db: AsyncSession, *, user_id: uuid.UUID) -> NotificationPreference:
    """Return the prefs row for `user_id`, inserting defaults if missing."""
    existing = (
        await db.execute(select(NotificationPreference).where(NotificationPreference.user_id == user_id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    prefs = NotificationPreference(
        user_id=user_id,
        in_app_enabled=True,
        email_enabled=True,
        push_enabled=True,
        type_overrides=None,
    )
    db.add(prefs)
    await db.flush()
    return prefs


def allowed_channels_for(prefs: NotificationPreference | None, notification_type: str) -> set[str]:
    """Compute which channel names this user accepts for `notification_type`.

    Resolution order:
    1. Start from the global toggles on `prefs` (in_app/email/push).
    2. Apply per-type overrides — they can both enable a globally-disabled
       channel and disable a globally-enabled one.
    3. If `prefs` is None, every channel is allowed (default state).
    """
    if prefs is None:
        return set(ALL_CHANNELS)

    allowed = {ch for ch, field in _FIELD_FOR_CHANNEL.items() if getattr(prefs, field, True)}

    for channel, enabled in ((prefs.type_overrides or {}).get(notification_type) or {}).items():
        if channel in ALL_CHANNELS:
            allowed.add(channel) if enabled else allowed.discard(channel)
    return allowed
