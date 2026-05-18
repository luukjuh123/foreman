"""Tests for branded HTML/PDF report rendering."""

from datetime import date

import pytest

from app.services.reports.pdf import (
    PDFRenderer,
    WeasyPrintRenderer,
    render_report_html,
    render_report_pdf,
)


# ---------------------------------------------------------------------------
# Sample payloads
# ---------------------------------------------------------------------------

WEEKLY_SAMPLE: dict = {
    "type": "weekly",
    "project": {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "Casa di Test",
        "description": "Renovation",
        "status": "active",
        "budget_cents": 500_000,
        "start_date": "2025-01-01",
        "end_date": "2025-06-01",
    },
    "period": {"start": "2025-02-03", "end": "2025-02-09"},
    "next_week": {"start": "2025-02-10", "end": "2025-02-16"},
    "phases": [],
    "tasks": [],
    "totals": {
        "task_count": 3, "completed_task_count": 2,
        "estimated_hours": 24.0, "labor_cost_cents": 132_000,
    },
    "completed_this_week": [
        {"id": "t1", "name": "Dig", "phase_name": "Foundation",
         "estimated_hours": 8.0, "labor_cost_cents": 40_000},
    ],
    "hours_by_phase": [
        {"phase_id": "p1", "phase_name": "Foundation", "task_count": 3,
         "estimated_hours": 24.0, "labor_cost_cents": 132_000},
    ],
    "next_week_plan": [
        {"id": "t4", "name": "Walls", "phase_name": "Framing",
         "status": "todo", "estimated_hours": 20.0, "labor_cost_cents": 100_000,
         "start_date": "2025-02-10", "end_date": "2025-02-14"},
    ],
    "photos": [],
}

COMPLETION_SAMPLE: dict = {
    "type": "completion",
    "project": {
        "id": "00000000-0000-0000-0000-000000000002",
        "name": "Casa Finita",
        "description": None,
        "status": "completed",
        "budget_cents": 1_000_000,
        "start_date": "2025-01-01",
        "end_date": "2025-03-31",
    },
    "phases": [],
    "tasks": [],
    "totals": {
        "task_count": 4, "completed_task_count": 3,
        "estimated_hours": 44.0, "labor_cost_cents": 232_000,
    },
    "timeline": {
        "planned_start": "2025-01-01", "planned_end": "2025-03-31",
        "planned_duration_days": 90,
        "actual_start": "2025-01-05", "actual_end": "2025-03-25",
        "actual_duration_days": 80,
    },
    "costs_vs_budget": {
        "budget_cents": 1_000_000, "actual_cost_cents": 232_000,
        "variance_cents": 768_000, "variance_pct": -76.8, "over_budget": False,
    },
    "phase_summary": [
        {"phase_id": "p1", "phase_name": "Foundation", "status": "done",
         "task_count": 2, "completed_task_count": 2,
         "estimated_hours": 20.0, "actual_cost_cents": 112_000},
    ],
    "lessons_learned": [],
    "photos": [],
}


# ---------------------------------------------------------------------------
# Fake renderer for tests
# ---------------------------------------------------------------------------

class _FakePDFRenderer(PDFRenderer):
    def __init__(self) -> None:
        self.captured_html: str | None = None

    def render(self, html: str) -> bytes:
        self.captured_html = html
        return b"%PDF-1.4 fake-bytes\n"


# ---------------------------------------------------------------------------
# HTML rendering tests
# ---------------------------------------------------------------------------

def test_html_contains_branded_header() -> None:
    html = render_report_html(WEEKLY_SAMPLE)
    assert "foreman" in html.lower()
    assert "<html" in html.lower()
    assert "</html>" in html.lower()


def test_html_weekly_contains_project_and_period() -> None:
    html = render_report_html(WEEKLY_SAMPLE)
    assert "Casa di Test" in html
    assert "2025-02-03" in html
    assert "2025-02-09" in html


def test_html_weekly_contains_sections() -> None:
    html = render_report_html(WEEKLY_SAMPLE).lower()
    assert "weekly" in html
    assert "completed this week" in html
    assert "next week" in html
    assert "dig" in html
    assert "walls" in html


def test_html_weekly_renders_euros_not_cents() -> None:
    html = render_report_html(WEEKLY_SAMPLE)
    # 132_000 cents == €1,320.00
    assert "€" in html
    assert "1,320.00" in html or "1.320,00" in html


def test_html_completion_contains_timeline_and_budget() -> None:
    html = render_report_html(COMPLETION_SAMPLE).lower()
    assert "completion" in html
    assert "timeline" in html
    assert "budget" in html
    assert "casa finita" in html
    # planned vs actual surfaced
    assert "2025-01-05" in html
    assert "2025-03-31" in html


def test_html_escapes_user_supplied_strings() -> None:
    payload = {
        **WEEKLY_SAMPLE,
        "project": {**WEEKLY_SAMPLE["project"],
                    "name": "<script>alert('x')</script>"},
        "completed_this_week": [
            {"id": "tA", "name": "Pour & set", "phase_name": "Foundation",
             "estimated_hours": 1.0, "labor_cost_cents": 100},
        ],
    }
    html = render_report_html(payload)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "Pour &amp; set" in html


def test_html_unknown_report_type_raises() -> None:
    with pytest.raises(ValueError):
        render_report_html({**WEEKLY_SAMPLE, "type": "nonsense"})


# ---------------------------------------------------------------------------
# PDF renderer tests
# ---------------------------------------------------------------------------

def test_pdf_render_returns_bytes_via_fake_renderer() -> None:
    fake = _FakePDFRenderer()
    pdf = render_report_pdf(WEEKLY_SAMPLE, renderer=fake)
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF-")
    assert fake.captured_html is not None
    assert "Casa di Test" in fake.captured_html


def test_pdf_render_completion_via_fake_renderer() -> None:
    fake = _FakePDFRenderer()
    pdf = render_report_pdf(COMPLETION_SAMPLE, renderer=fake)
    assert pdf.startswith(b"%PDF-")
    assert "Casa Finita" in (fake.captured_html or "")


def test_weasyprint_renderer_lazy_imports() -> None:
    # The class exists and instantiates without importing weasyprint.
    r = WeasyPrintRenderer()
    assert isinstance(r, PDFRenderer)


def test_weasyprint_renderer_raises_clear_error_if_missing(monkeypatch) -> None:
    import builtins
    real_import = builtins.__import__

    def fake_import(name, *a, **k):
        if name == "weasyprint" or name.startswith("weasyprint."):
            raise ImportError("weasyprint not installed")
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    r = WeasyPrintRenderer()
    with pytest.raises(RuntimeError, match="weasyprint"):
        r.render("<html></html>")
