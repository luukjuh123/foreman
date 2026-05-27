"""Safety service — certification expiry detection."""

from __future__ import annotations

from datetime import date, timedelta

_EXPIRY_WARN_DAYS = 30


def compute_cert_status(expiry_date: date, today: date | None = None) -> str:
    """Return 'expired', 'expiring_soon', or 'active' for a certification.

    Args:
        expiry_date: The date the certification expires.
        today: Reference date (defaults to date.today()).

    Returns:
        One of: 'expired', 'expiring_soon', 'active'.
    """
    if today is None:
        today = date.today()

    if expiry_date < today:
        return "expired"
    if expiry_date <= today + timedelta(days=_EXPIRY_WARN_DAYS):
        return "expiring_soon"
    return "active"
