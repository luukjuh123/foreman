"""Notification dispatcher — fans out a notification to registered channels.

Design:
- A notification is always persisted to the `notifications` table first so the
  in-app feed has a single source of truth.
- Then each registered channel's `send()` is invoked. A channel name is added
  to `channels_dispatched` iff it succeeded. Failures are logged and swallowed
  so one broken channel can't block delivery on the others.
- Callers may pass `channels=[...]` to restrict dispatch to a subset (e.g.
  when user preferences disable email).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User
from app.services.notifications.channels import NotificationChannel

logger = logging.getLogger(__name__)


class NotificationDispatcher:
    """Holds a list of channels and dispatches notifications to them."""

    def __init__(self, channels: Iterable[NotificationChannel]) -> None:
        self.channels: list[NotificationChannel] = list(channels)

    def channel_names(self) -> list[str]:
        return [c.name for c in self.channels]

    async def dispatch(
        self,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        type: str,
        title: str,
        body: str = "",
        data: dict | None = None,
        channels: list[str] | None = None,
    ) -> Notification:
        """Persist + fan out. Returns the persisted Notification.

        `channels` (optional) restricts which channels are invoked, e.g.
        `["in_app", "email"]`. If `None` all registered channels are tried.
        """
        user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            raise ValueError(f"user {user_id} does not exist")

        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            data=data,
            channels_dispatched=[],
        )
        db.add(notification)
        await db.flush()  # need PK for channels referencing it

        dispatched: list[str] = []
        for channel in self.channels:
            if channels is not None and channel.name not in channels:
                continue
            try:
                await channel.send(notification, user)
                dispatched.append(channel.name)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "notification_channel_failed",
                    extra={
                        "channel": channel.name,
                        "notification_id": str(notification.id),
                    },
                )

        notification.channels_dispatched = dispatched
        await db.commit()
        await db.refresh(notification)
        return notification
