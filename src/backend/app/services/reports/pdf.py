"""Branded HTML + PDF rendering for project reports.

* ``render_report_html(data)`` — produces a self-contained branded HTML
  document from a weekly or completion report payload.
* ``PDFRenderer`` — a small Protocol so we can swap WeasyPrint for a fake
  in tests without dragging the (heavy, native-deps-laden) WeasyPrint
  library into the unit-test environment.
* ``WeasyPrintRenderer`` — lazy-imports ``weasyprint`` only at ``render``
  time and surfaces a clear ``RuntimeError`` if it isn't installed.
* ``render_report_pdf(data, renderer=...)`` — convenience that combines
  the two.

The HTML is intentionally simple/self-contained (inline CSS, no external
fonts) so it renders identically through WeasyPrint and any browser.
"""

from __future__ import annotations

from html import escape
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class PDFRenderer(Protocol):
    """Render HTML into PDF bytes."""

    def render(self, html: str) -> bytes:  # pragma: no cover - protocol
        ...


class WeasyPrintRenderer:
    """Default renderer — defers the ``weasyprint`` import until ``render``."""

    def render(self, html: str) -> bytes:
        try:
            from weasyprint import HTML  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError(
                "PDF rendering requires the 'weasyprint' package. "
                "Install it with: pip install weasyprint"
            ) from exc
        return HTML(string=html).write_pdf()  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Money formatting
# ---------------------------------------------------------------------------

def _format_euros(cents: int | None) -> str:
    """Format an integer-cents amount as ``€X,XXX.XX``."""
    v = int(cents or 0) / 100
    return f"€{v:,.2f}"


def _h(value: Any) -> str:
    return escape("" if value is None else str(value))


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

_CSS = """
  body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
         color: #111; margin: 32px; }
  header { border-bottom: 3px solid #0d6e6e; padding-bottom: 12px;
           margin-bottom: 24px; display: flex; justify-content: space-between;
           align-items: center; }
  .brand { font-size: 22px; font-weight: 700; color: #0d6e6e;
           letter-spacing: 0.5px; }
  h1 { font-size: 24px; margin: 0 0 4px 0; }
  h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #eee;
       padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px;
          font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { background: #f7f9f9; }
  .meta { color: #555; font-size: 13px; }
  .kpi { display: inline-block; padding: 8px 12px; margin-right: 12px;
         background: #f7f9f9; border-radius: 6px; font-size: 13px; }
  .kpi strong { display: block; font-size: 16px; }
  .over { color: #b3261e; font-weight: 700; }
  .under { color: #0a7d3b; font-weight: 700; }
"""


def _header(title: str, project_name: str) -> str:
    return (
        f"<header>"
        f"<div><h1>{_h(title)}</h1>"
        f"<div class='meta'>{_h(project_name)}</div></div>"
        f"<div class='brand'>foreman</div>"
        f"</header>"
    )


def _kpis(*items: tuple[str, str]) -> str:
    return "".join(
        f"<div class='kpi'><span>{_h(label)}</span><strong>{_h(value)}</strong></div>"
        for label, value in items
    )


def _table(headers: list[str], rows: list[list[str]]) -> str:
    head = "<tr>" + "".join(f"<th>{_h(h)}</th>" for h in headers) + "</tr>"
    body = "".join(
        "<tr>" + "".join(f"<td>{_h(c)}</td>" for c in row) + "</tr>"
        for row in rows
    )
    return f"<table>{head}{body}</table>"


def _render_weekly(data: dict[str, Any]) -> str:
    proj = data["project"]
    period = data["period"]
    totals = data["totals"]
    completed = data.get("completed_this_week", [])
    by_phase = data.get("hours_by_phase", [])
    next_plan = data.get("next_week_plan", [])

    sections = [
        _header(f"Weekly report — {proj['name']}", f"{period['start']} → {period['end']}"),
        _kpis(
            ("Tasks", f"{totals['task_count']}"),
            ("Completed", f"{totals['completed_task_count']}"),
            ("Hours", f"{totals['estimated_hours']:.1f}"),
            ("Labor cost", _format_euros(totals["labor_cost_cents"])),
        ),
        "<h2>Completed this week</h2>",
        _table(
            ["Task", "Phase", "Hours", "Cost"],
            [[t["name"], t["phase_name"], f"{t['estimated_hours']:.1f}",
              _format_euros(t["labor_cost_cents"])] for t in completed]
        ) if completed else "<p class='meta'>No tasks completed this week.</p>",
        "<h2>Hours by phase</h2>",
        _table(
            ["Phase", "Tasks", "Hours", "Labor cost"],
            [[p["phase_name"], str(p["task_count"]), f"{p['estimated_hours']:.1f}",
              _format_euros(p["labor_cost_cents"])] for p in by_phase]
        ) if by_phase else "<p class='meta'>No phase activity this week.</p>",
        f"<h2>Next week plan ({data.get('next_week', {}).get('start', '')} → "
        f"{data.get('next_week', {}).get('end', '')})</h2>",
        _table(
            ["Task", "Phase", "Status", "Start", "End", "Hours", "Cost"],
            [[t["name"], t["phase_name"], t["status"],
              t.get("start_date") or "", t.get("end_date") or "",
              f"{t['estimated_hours']:.1f}",
              _format_euros(t["labor_cost_cents"])] for t in next_plan]
        ) if next_plan else "<p class='meta'>No tasks scheduled for next week.</p>",
    ]
    return "".join(sections)


def _render_completion(data: dict[str, Any]) -> str:
    proj = data["project"]
    tl = data["timeline"]
    cb = data["costs_vs_budget"]
    phase_summary = data.get("phase_summary", [])
    totals = data["totals"]

    variance_class = "over" if cb["over_budget"] else "under"
    variance_str = (
        f"{_format_euros(cb['variance_cents'])} "
        f"({cb['variance_pct']:.1f}%)" if cb["variance_pct"] is not None
        else _format_euros(cb["variance_cents"])
    )

    sections = [
        _header(f"Completion report — {proj['name']}", f"Status: {proj['status']}"),
        _kpis(
            ("Tasks", f"{totals['task_count']}"),
            ("Completed", f"{totals['completed_task_count']}"),
            ("Hours", f"{totals['estimated_hours']:.1f}"),
            ("Actual cost", _format_euros(totals["labor_cost_cents"])),
        ),
        "<h2>Timeline</h2>",
        _table(
            ["", "Start", "End", "Duration (days)"],
            [
                ["Planned", tl["planned_start"] or "—", tl["planned_end"] or "—",
                 str(tl["planned_duration_days"] or "—")],
                ["Actual", tl["actual_start"] or "—", tl["actual_end"] or "—",
                 str(tl["actual_duration_days"] or "—")],
            ],
        ),
        "<h2>Costs vs Budget</h2>",
        _table(
            ["Budget", "Actual", "Variance"],
            [[_format_euros(cb["budget_cents"]), _format_euros(cb["actual_cost_cents"]),
              variance_str]],
        ),
        f"<p class='{variance_class}'>"
        f"{'Over budget' if cb['over_budget'] else 'Within budget'}.</p>",
        "<h2>Phase summary</h2>",
        _table(
            ["Phase", "Status", "Tasks", "Completed", "Hours", "Actual cost"],
            [[p["phase_name"], p["status"], str(p["task_count"]),
              str(p["completed_task_count"]), f"{p['estimated_hours']:.1f}",
              _format_euros(p["actual_cost_cents"])] for p in phase_summary]
        ) if phase_summary else "<p class='meta'>No phases.</p>",
    ]
    return "".join(sections)


def render_report_html(data: dict[str, Any]) -> str:
    """Render a report payload as a branded, self-contained HTML document."""
    rtype = data.get("type")
    if rtype == "weekly":
        body = _render_weekly(data)
    elif rtype == "completion":
        body = _render_completion(data)
    else:
        raise ValueError(f"Unknown report type: {rtype!r}")

    return (
        "<!DOCTYPE html>"
        "<html lang='en'><head><meta charset='utf-8'>"
        f"<title>{_h(data['project']['name'])} — report</title>"
        f"<style>{_CSS}</style>"
        f"</head><body>{body}</body></html>"
    )


def render_report_pdf(
    data: dict[str, Any],
    renderer: PDFRenderer | None = None,
) -> bytes:
    """Render a report payload as PDF bytes."""
    html = render_report_html(data)
    r = renderer if renderer is not None else WeasyPrintRenderer()
    return r.render(html)
