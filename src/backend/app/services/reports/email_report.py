"""Compose and dispatch project reports as email (PDF attached + share link).

Pure orchestration — no FastAPI / DB concerns. Takes a structured report
payload, a recipient, an ``EmailSender`` and a ``PDFRenderer`` and fires.
"""

from __future__ import annotations

from typing import Iterable

from app.services.reports.email_sender import EmailMessage, EmailSender
from app.services.reports.pdf import PDFRenderer, render_report_html, render_report_pdf


_TYPE_LABELS = {"weekly": "Weekly", "completion": "Completion"}


def _subject_for(data: dict) -> str:
    rtype = data.get("type", "report")
    label = _TYPE_LABELS.get(rtype, rtype.capitalize())
    project_name = data["project"]["name"]
    if rtype == "weekly":
        period = data["period"]
        return f"{label} report — {project_name} ({period['start']} → {period['end']})"
    return f"{label} report — {project_name}"


def _attachment_filename(data: dict) -> str:
    rtype = data.get("type", "report")
    project_name = data["project"]["name"].lower().replace(" ", "-")
    if rtype == "weekly":
        period_start = data["period"]["start"]
        return f"{project_name}-weekly-{period_start}.pdf"
    return f"{project_name}-completion.pdf"


def _wrapper_html(report_html: str, share_url: str) -> str:
    return (
        "<!DOCTYPE html><html><body>"
        "<p>Hi,</p>"
        "<p>Please find the latest project report attached as a PDF. You can "
        f'also view it online at <a href="{share_url}">{share_url}</a>.</p>'
        "<hr>"
        f"{report_html}"
        "</body></html>"
    )


def _wrapper_text(data: dict, share_url: str) -> str:
    return (
        f"Hi,\n\n"
        f"Please find the latest project report ({data['project']['name']}) "
        f"attached as a PDF.\n\n"
        f"You can also view it online: {share_url}\n\n"
        f"— foreman\n"
    )


def send_report_email(
    data: dict,
    *,
    recipient: str | Iterable[str],
    sender: EmailSender,
    pdf_renderer: PDFRenderer,
    share_url: str,
) -> list[EmailMessage]:
    """Render ``data`` to PDF and dispatch via ``sender``.

    ``recipient`` can be a single address or an iterable — one ``To:`` line
    per recipient (so each customer gets a personally-addressed copy
    rather than seeing the whole list).

    Returns the list of dispatched ``EmailMessage`` objects.
    """
    html = render_report_html(data)
    pdf_bytes = render_report_pdf(data, renderer=pdf_renderer)
    filename = _attachment_filename(data)
    subject = _subject_for(data)

    recipients: list[str]
    if isinstance(recipient, str):
        recipients = [recipient]
    else:
        recipients = [r for r in recipient]

    dispatched: list[EmailMessage] = []
    for to in recipients:
        msg = EmailMessage(
            to=to,
            subject=subject,
            body_html=_wrapper_html(html, share_url),
            body_text=_wrapper_text(data, share_url),
            attachments=[(filename, pdf_bytes, "application/pdf")],
        )
        sender.send(msg)
        dispatched.append(msg)
    return dispatched
