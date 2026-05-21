"""Customer-facing email notifications.

These are higher-level helpers built on top of `NotificationDispatcher`.
Each function defines the canonical title/body template for a customer
notification type, computes the human-readable amount when relevant, and
hands off to the dispatcher with `channels=["in_app", "email"]`. Persistence
to the `notifications` table is automatic (so the in-app feed always sees
the same event the customer was emailed about).
"""

from __future__ import annotations

import uuid

from app.models.notification import Notification
from app.services.notifications.engine import NotificationDispatcher
from sqlalchemy.ext.asyncio import AsyncSession

_CUSTOMER_CHANNELS = ["in_app", "email"]


def _format_euros(cents: int) -> str:
    """Render `cents` as a euro amount, e.g. 12345 → '€123.45'."""
    if cents < 0:
        raise ValueError("amount_cents must be non-negative")
    return f"€{cents // 100}.{cents % 100:02d}"


async def notify_project_update(
    db: AsyncSession,
    dispatcher: NotificationDispatcher,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    project_name: str,
    update_summary: str,
) -> Notification:
    """Tell a customer their project has new activity."""
    return await dispatcher.dispatch(
        db,
        user_id=user_id,
        type="customer.project_updated",
        title=f"Update on {project_name}",
        body=update_summary,
        data={
            "project_id": str(project_id),
            "project_name": project_name,
        },
        channels=_CUSTOMER_CHANNELS,
    )


async def notify_invoice_sent(
    db: AsyncSession,
    dispatcher: NotificationDispatcher,
    *,
    user_id: uuid.UUID,
    invoice_id: uuid.UUID,
    invoice_number: str,
    amount_cents: int,
) -> Notification:
    """Tell a customer an invoice has been sent."""
    amount = _format_euros(amount_cents)
    return await dispatcher.dispatch(
        db,
        user_id=user_id,
        type="customer.invoice_sent",
        title=f"Invoice {invoice_number} is ready",
        body=(
            f"Your invoice {invoice_number} for {amount} has been sent. "
            "Please check your email for payment details."
        ),
        data={
            "invoice_id": str(invoice_id),
            "invoice_number": invoice_number,
            "amount_cents": amount_cents,
        },
        channels=_CUSTOMER_CHANNELS,
    )


async def notify_report_ready(
    db: AsyncSession,
    dispatcher: NotificationDispatcher,
    *,
    user_id: uuid.UUID,
    report_id: uuid.UUID,
    report_url: str,
    report_title: str,
) -> Notification:
    """Tell a customer that a report they requested is ready to download."""
    return await dispatcher.dispatch(
        db,
        user_id=user_id,
        type="customer.report_ready",
        title=f"{report_title} is ready",
        body=f"Your report '{report_title}' is ready. View it here: {report_url}",
        data={
            "report_id": str(report_id),
            "report_url": report_url,
            "report_title": report_title,
        },
        channels=_CUSTOMER_CHANNELS,
    )
