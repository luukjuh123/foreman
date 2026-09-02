from __future__ import annotations

import uuid

from app.models.notification import Notification
from app.services.notifications.engine import NotificationDispatcher
from sqlalchemy.ext.asyncio import AsyncSession

_CHANNELS = ["in_app", "email"]


def _format_euros(cents: int) -> str:
    if cents < 0:
        raise ValueError("amount_cents must be non-negative")
    return f"€{cents // 100}.{cents % 100:02d}"


async def notify_project_update(
    db: AsyncSession, dispatcher: NotificationDispatcher, *,
    user_id: uuid.UUID, project_id: uuid.UUID, project_name: str, update_summary: str,
) -> Notification:
    return await dispatcher.dispatch(
        db, user_id=user_id, type="customer.project_updated",
        title=f"Update on {project_name}", body=update_summary,
        data={"project_id": str(project_id), "project_name": project_name},
        channels=_CHANNELS,
    )


async def notify_invoice_sent(
    db: AsyncSession, dispatcher: NotificationDispatcher, *,
    user_id: uuid.UUID, invoice_id: uuid.UUID, invoice_number: str, amount_cents: int,
) -> Notification:
    amount = _format_euros(amount_cents)
    return await dispatcher.dispatch(
        db, user_id=user_id, type="customer.invoice_sent",
        title=f"Invoice {invoice_number} is ready",
        body=f"Your invoice {invoice_number} for {amount} has been sent. Please check your email for payment details.",
        data={"invoice_id": str(invoice_id), "invoice_number": invoice_number, "amount_cents": amount_cents},
        channels=_CHANNELS,
    )


async def notify_report_ready(
    db: AsyncSession, dispatcher: NotificationDispatcher, *,
    user_id: uuid.UUID, report_id: uuid.UUID, report_url: str, report_title: str,
) -> Notification:
    return await dispatcher.dispatch(
        db, user_id=user_id, type="customer.report_ready",
        title=f"{report_title} is ready",
        body=f"Your report '{report_title}' is ready. View it here: {report_url}",
        data={"report_id": str(report_id), "report_url": report_url, "report_title": report_title},
        channels=_CHANNELS,
    )
