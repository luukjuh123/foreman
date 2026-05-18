"""Report generation services."""

from app.services.reports.completion import generate_completion_report
from app.services.reports.engine import aggregate_project_data
from app.services.reports.pdf import (
    PDFRenderer,
    WeasyPrintRenderer,
    render_report_html,
    render_report_pdf,
)
from app.services.reports.tokens import (
    InvalidReportToken,
    sign_report_token,
    verify_report_token,
)
from app.services.reports.weekly import generate_weekly_report

__all__ = [
    "InvalidReportToken",
    "PDFRenderer",
    "WeasyPrintRenderer",
    "aggregate_project_data",
    "generate_completion_report",
    "generate_weekly_report",
    "render_report_html",
    "render_report_pdf",
    "sign_report_token",
    "verify_report_token",
]
