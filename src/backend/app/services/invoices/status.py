"""Invoice status state machine and overdue sweep."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import INVOICE_STATUSES, Invoice

# Allowed transitions between invoice statuses.
# draft   → sent, cancelled
# sent    → paid, overdue, cancelled
# overdue → paid, cancelled
# paid, cancelled are terminal.
_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"sent", "cancelled"}),
    "sent": frozenset({"paid", "overdue", "cancelled"}),
    "overdue": frozenset({"paid", "cancelled"}),
    "paid": frozenset(),
    "cancelled": frozenset(),
}


def is_legal_transition(current: str, target: str) -> bool:
    """Return True if moving from `current` to `target` is allowed."""
    if current not in INVOICE_STATUSES or target not in INVOICE_STATUSES:
        return False
    return target in _TRANSITIONS.get(current, frozenset())


def apply_transition(invoice: Invoice, target: str, *, now: datetime | None = None) -> None:
    """Mutate `invoice` to the new status, setting sent_at / paid_at as needed."""
    if not is_legal_transition(invoice.status, target):
        raise ValueError(
            f"Illegal transition: {invoice.status!r} -> {target!r}"
        )
    moment = now or datetime.now(timezone.utc)
    invoice.status = target
    if target == "sent" and invoice.sent_at is None:
        invoice.sent_at = moment
    elif target == "paid" and invoice.paid_at is None:
        invoice.paid_at = moment


async def sweep_overdue(db: AsyncSession, *, as_of: date) -> int:
    """Mark all `sent` invoices whose due_date is strictly before `as_of` as `overdue`.

    Returns the number of invoices updated. Caller is responsible for commit.
    """
    result = await db.execute(
        select(Invoice).where(
            Invoice.status == "sent",
            Invoice.due_date < as_of,
            Invoice.deleted_at.is_(None),
        )
    )
    invoices = result.scalars().all()
    for inv in invoices:
        inv.status = "overdue"
    return len(invoices)
