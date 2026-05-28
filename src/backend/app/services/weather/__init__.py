"""Weather service — fetches forecasts and assesses construction risk."""

from __future__ import annotations

# Outdoor process keywords (Dutch construction terms) — case-insensitive substring match.
# Tasks matching any of these are weather-sensitive and must not be scheduled on poor-risk days.
_OUTDOOR_KEYWORDS = frozenset(
    [
        "schilderen",
        "dakwerk",
        "voegen",
        "metselwerk",
    ]
)


def is_outdoor_process(task_name: str) -> bool:
    """Return True when a task name indicates weather-sensitive outdoor work.

    Matches any of the Dutch outdoor process keywords as a case-insensitive
    substring of the task name.  Examples:
        "schilderen"         → True
        "ramen schilderen"   → True  (substring match)
        "Dakwerk"            → True  (case-insensitive)
        "stucen"             → False
    """
    lower = task_name.lower()
    return any(kw in lower for kw in _OUTDOOR_KEYWORDS)
