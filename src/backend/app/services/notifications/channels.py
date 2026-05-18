"""Pluggable notification channels.

A `NotificationChannel` knows how to deliver a persisted `Notification` to a
user via a specific medium (in-app feed, email, push). Channels are dumb
transports: they do not decide *whether* to send (that is the dispatcher's
responsibility, e.g. consulting user preferences). Real channels should be
safe to no-op when their provider is unconfigured so that local development
and tests don't require external services.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


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

    async def send(self, notification: Notification, user: User) -> None:  # noqa: ARG002
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
    """Mobile push channel. Default no-op; integrates with FCM/APNs in prod."""

    name = "push"

    async def send(self, notification: Notification, user: User) -> None:
        logger.info(
            "push_notification",
            extra={
                "user_id": str(user.id),
                "type": notification.type,
                "title": notification.title,
            },
        )
