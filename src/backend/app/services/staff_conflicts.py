"""Staff conflict detection service — cross-project double-booking detection."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.models.assignment import StaffAssignment
from app.models.staff import Staff
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class ConflictPair:
    """A pair of overlapping assignments for the same staff member."""

    staff_id: str
    assignment_a: dict
    assignment_b: dict
    overlap_start: datetime
    overlap_end: datetime


def _assignment_to_dict(a: StaffAssignment) -> dict:
    return {
        "id": str(a.id),
        "project_id": str(a.project_id),
        "task_id": str(a.task_id) if a.task_id else None,
        "start_at": a.start_at.isoformat(),
        "end_at": a.end_at.isoformat(),
    }


def _overlap_window(a: StaffAssignment, b: StaffAssignment) -> tuple[datetime, datetime] | None:
    """Return (overlap_start, overlap_end) if a and b overlap, else None."""
    start = max(a.start_at, b.start_at)
    end = min(a.end_at, b.end_at)
    if start < end:
        return start, end
    return None


async def get_conflicts_for_staff(db: AsyncSession, staff_id: uuid.UUID) -> list[ConflictPair]:
    """Return all conflicting assignment pairs for a single staff member."""
    result = await db.execute(
        select(StaffAssignment).where(StaffAssignment.staff_id == staff_id).order_by(StaffAssignment.start_at)
    )
    assignments = list(result.scalars().all())

    conflicts: list[ConflictPair] = []
    for i, a in enumerate(assignments):
        for b in assignments[i + 1 :]:
            # Since sorted by start_at, once b.start_at >= a.end_at no more overlaps possible.
            if b.start_at >= a.end_at:
                break
            window = _overlap_window(a, b)
            if window:
                conflicts.append(
                    ConflictPair(
                        staff_id=str(staff_id),
                        assignment_a=_assignment_to_dict(a),
                        assignment_b=_assignment_to_dict(b),
                        overlap_start=window[0],
                        overlap_end=window[1],
                    )
                )
    return conflicts


async def get_all_conflicts(db: AsyncSession, owner_id: uuid.UUID) -> list[ConflictPair]:
    """Return all conflicting assignment pairs across all staff owned by owner_id."""
    staff_result = await db.execute(select(Staff).where(Staff.owner_id == owner_id, Staff.deleted_at.is_(None)))
    all_staff = staff_result.scalars().all()

    all_conflicts: list[ConflictPair] = []
    for s in all_staff:
        pairs = await get_conflicts_for_staff(db, s.id)
        all_conflicts.extend(pairs)
    return all_conflicts


def build_conflict_suggestions(
    conflicting: StaffAssignment,
    requested_start: datetime,
    requested_end: datetime,
) -> list[dict]:
    """Build resolution suggestions for a conflicting assignment request."""
    duration = requested_end - requested_start
    next_available = conflicting.end_at
    return [
        {
            "type": "reschedule_after_conflict",
            "description": "Schedule after the conflicting assignment ends",
            "next_available_after": conflicting.end_at.isoformat(),
            "suggested_start": next_available.isoformat(),
            "suggested_end": (next_available + duration).isoformat(),
        },
        {
            "type": "reschedule_before_conflict",
            "description": "Schedule before the conflicting assignment starts",
            "suggested_end": conflicting.start_at.isoformat(),
            "suggested_start": (conflicting.start_at - duration).isoformat(),
        },
    ]
