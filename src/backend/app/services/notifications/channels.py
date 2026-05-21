"""Pluggable notification channels.

A `NotificationChannel` knows how to deliver a persisted `Notification` to a
user via a specific medium (in-app feed, email, push). Channels are dumb
transports: they do not decide *whether* to send (that is the dispatcher's
responsibility, e.g. consulting user preferences). Real channels should be
safe to no-op when their provider is unconfigured so that local development
and tests don't require external services.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod

from app.core.config import settings
from app.models.notification import Notification
from app.models.push_subscription import PushSubscription
from app.models.user import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

try:
    from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    webpush = None  # type: ignore[assignment]
    WebPushException = Exception  # type: ignore[assignment,misc]


class NotificationChannel(ABC):
    """Abstract base class. Subclasses set `name` and implement `send`."""

    name: str = ""

    @abstractmethod
    async def send(self, notification: Notification, user: User) -> None:
        """Deliver the notification. Raise on failure."""


class InAppChannel(NotificationChannel):
    """In-app feed. Persistence is handled by the dispatcher; this channel is
    a marker that records "in_app" in `channels_dispatched`."""

    name = "in_app"

    async def send(self, notification: Notification, user: User) -> None:
        return None


class EmailChannel(NotificationChannel):
    """Email channel. Default implementation logs; production wiring can
    replace this with a real SMTP / transactional-email backend."""

    name = "email"

    async def send(self, notification: Notification, user: User) -> None:
        logger.info(
            "email_notification",
            extra={
                "to": user.email,
                "type": notification.type,
                "title": notification.title,
            },
        )


class PushChannel(NotificationChannel):
    """Web Push channel using VAPID. Sends to all subscriptions for the user.

    Requires ``VAPID_PRIVATE_KEY``, ``VAPID_PUBLIC_KEY``, and
    ``VAPID_CLAIM_EMAIL`` to be configured. When keys are absent the channel
    logs and skips — safe for local dev.

    Handles 410 Gone responses by deleting the stale subscription.
    """

    name = "push"

    def __init__(self, db: AsyncSession | None = None) -> None:
        self._db = db

    async def send(self, notification: Notification, user: User) -> None:
        if not settings.vapid_private_key or not settings.vapid_public_key or self._db is None:
            logger.info(
                "push_notification_skipped",
                extra={"user_id": str(user.id), "type": notification.type, "title": notification.title},
            )
            return

        if webpush is None:  # pragma: no cover
            logger.warning("push_notification_skipped_no_pywebpush")
            return

        result = await self._db.execute(
            select(PushSubscription).where(PushSubscription.user_id == user.id)
        )
        subscriptions = result.scalars().all()

        payload = json.dumps(
            {
                "title": notification.title,
                "body": notification.body,
                "type": notification.type,
                "data": notification.data or {},
            }
        )
        vapid_claims = {"sub": settings.vapid_claim_email}

        stale: list[PushSubscription] = []
        for sub in subscriptions:
            try:
                resp = webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims=vapid_claims,
                )
                if hasattr(resp, "status_code") and resp.status_code == 410:
                    stale.append(sub)
                else:
                    logger.info(
                        "push_notification_sent",
                        extra={"user_id": str(user.id), "endpoint": sub.endpoint[:40]},
                    )
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code == 410:
                    stale.append(sub)
                else:
                    logger.warning(
                        "push_notification_failed",
                        extra={"user_id": str(user.id), "error": str(exc)},
                    )

        for sub in stale:
            logger.info("push_subscription_expired", extra={"endpoint": sub.endpoint[:40]})
            await self._db.delete(sub)

        if stale:
            await self._db.commit()
