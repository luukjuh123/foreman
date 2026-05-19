"""Payroll calculation service.

Pure functions only: given a list of TimeEntry rows, compute gross salary cents
for a staff member across a period. All monetary values stay as integer cents.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class _Entry:
    project_id: uuid.UUID | None
    hours: float
    hourly_rate_cents_snapshot: int


def gross_cents_for_entry(hours: float, hourly_rate_cents_snapshot: int) -> int:
    """Compute gross salary cents for a single entry.

    Uses banker's-style rounding to nearest cent (round-half-to-even). Hours
    are multiplied by the snapshot rate; result is rounded to int cents so
    we never carry float money downstream.
    """
    if hours < 0:
        raise ValueError("hours must be non-negative")
    if hourly_rate_cents_snapshot < 0:
        raise ValueError("hourly_rate_cents_snapshot must be non-negative")
    return round(hours * hourly_rate_cents_snapshot)


def summarize(entries: list[_Entry]) -> tuple[float, int, dict[uuid.UUID | None, tuple[float, int]]]:
    """Return (total_hours, total_gross_cents, per_project_breakdown).

    Per-project breakdown maps project_id -> (hours, gross_cents).
    """
    total_hours = 0.0
    total_gross = 0
    per_project: dict[uuid.UUID | None, list[int]] = defaultdict(lambda: [0.0, 0])
    for e in entries:
        gross = gross_cents_for_entry(e.hours, e.hourly_rate_cents_snapshot)
        total_hours += e.hours
        total_gross += gross
        per_project[e.project_id][0] += e.hours
        per_project[e.project_id][1] += gross
    breakdown = {pid: (h, g) for pid, (h, g) in per_project.items()}
    return total_hours, total_gross, breakdown
