"""Quote status state machine."""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.quote import QUOTE_STATUSES, QUOTE_TRANSITIONS, Quote


def is_legal_transition(current: str, target: str) -> bool:
    """Return True if moving from `current` to `target` is allowed."""
    if current not in QUOTE_STATUSES or target not in QUOTE_STATUSES:
        return False
    return target in QUOTE_TRANSITIONS.get(current, frozenset())


def apply_transition(quote: Quote, target: str, *, now: datetime | None = None) -> None:
    """Mutate `quote` to the new status, setting sent_at / accepted_at as needed."""
    if not is_legal_transition(quote.status, target):
        raise ValueError(f"Illegal transition: {quote.status!r} -> {target!r}")
    moment = now or datetime.now(UTC)
    quote.status = target
    if target == "sent" and quote.sent_at is None:
        quote.sent_at = moment
    elif target == "accepted" and quote.accepted_at is None:
        quote.accepted_at = moment
