"""FastAPI dependency providing a configured `NotificationDispatcher`.

Kept in its own module so routers/services can depend on it without pulling
in the (much larger) notifications HTTP router as a side effect, and so tests
can override it cleanly with `app.dependency_overrides[get_default_dispatcher]`.
"""

from __future__ import annotations

from app.services.notifications.channels import (
    EmailChannel,
    InAppChannel,
    PushChannel,
)
from app.services.notifications.engine import NotificationDispatcher


def get_default_dispatcher() -> NotificationDispatcher:
    """Return a dispatcher wired with all three built-in channels."""
    return NotificationDispatcher(channels=[InAppChannel(), EmailChannel(), PushChannel()])
