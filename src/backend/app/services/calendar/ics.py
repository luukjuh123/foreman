"""iCalendar (RFC 5545) export for agenda tasks.

This module produces a VCALENDAR document containing one VEVENT per
scheduled task. Each event uses the task's start_date / end_date as an
all-day event (DTSTART;VALUE=DATE / DTEND;VALUE=DATE). Per RFC 5545,
DTEND for an all-day event is the day *after* the last included day,
so we add 1 day to task.end_date.

The implementation prefers the `icalendar` library (declared as a
project dependency). If unavailable at import time we fall back to a
minimal hand-written serializer that emits the same fields so the
endpoint remains usable in stripped-down environments.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta

from app.models.project import Phase, Project, Task

PRODID = "-//foreman//Agenda Export//EN"


def _ical_status(task_status: str) -> str:
    """Map our task status to RFC 5545 VEVENT STATUS values."""
    mapping = {
        "todo": "TENTATIVE",
        "in_progress": "CONFIRMED",
        "done": "CONFIRMED",
        "blocked": "TENTATIVE",
    }
    return mapping.get(task_status, "TENTATIVE")


# ---------------------------------------------------------------------------
# Library-backed implementation (preferred)
# ---------------------------------------------------------------------------


def _build_with_library(rows: Iterable[tuple[Task, Phase, Project]]) -> bytes:
    from icalendar import Calendar, Event  # type: ignore[import-not-found]

    cal = Calendar()
    cal.add("prodid", PRODID)
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")

    now = datetime.now(UTC)
    for task, phase, project in rows:
        if task.start_date is None or task.end_date is None:
            continue
        event = Event()
        event.add("uid", f"task-{task.id}@foreman")
        event.add("dtstamp", now)
        event.add("summary", f"{project.name}: {task.name}")
        event.add(
            "description",
            task.description or f"Phase: {phase.name}\nStatus: {task.status}",
        )
        event.add("dtstart", task.start_date)
        # All-day events: DTEND is exclusive — add one day.
        event.add("dtend", task.end_date + timedelta(days=1))
        event.add("status", _ical_status(task.status))
        event.add("categories", [project.name])
        cal.add_component(event)

    return cal.to_ical()


# ---------------------------------------------------------------------------
# Fallback hand-written implementation (RFC 5545 compliant subset)
# ---------------------------------------------------------------------------


def _escape(value: str) -> str:
    """Escape special characters per RFC 5545 §3.3.11."""
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Fold long lines to 75 octets per RFC 5545 §3.1."""
    if len(line) <= 75:
        return line
    out = [line[:75]]
    rest = line[75:]
    while rest:
        out.append(" " + rest[:74])
        rest = rest[74:]
    return "\r\n".join(out)


def _fmt_date(d: date) -> str:
    return d.strftime("%Y%m%d")


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _build_manual(rows: Iterable[tuple[Task, Phase, Project]]) -> bytes:
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        f"PRODID:{PRODID}",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    now = datetime.now(UTC)
    for task, phase, project in rows:
        if task.start_date is None or task.end_date is None:
            continue
        summary = _escape(f"{project.name}: {task.name}")
        desc = _escape(task.description or f"Phase: {phase.name}\nStatus: {task.status}")
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:task-{task.id}@foreman",
                f"DTSTAMP:{_fmt_dt(now)}",
                f"DTSTART;VALUE=DATE:{_fmt_date(task.start_date)}",
                f"DTEND;VALUE=DATE:{_fmt_date(task.end_date + timedelta(days=1))}",
                f"SUMMARY:{summary}",
                f"DESCRIPTION:{desc}",
                f"STATUS:{_ical_status(task.status)}",
                f"CATEGORIES:{_escape(project.name)}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return ("\r\n".join(_fold(line) for line in lines) + "\r\n").encode("utf-8")


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


def build_ics(rows: Iterable[tuple[Task, Phase, Project]]) -> bytes:
    """Return an RFC 5545 VCALENDAR document for the given task rows."""
    try:
        return _build_with_library(rows)
    except ImportError:
        return _build_manual(rows)
