"""Tests for report email auto-send (EmailSender interface + fake)."""

from __future__ import annotations

import pytest

from app.services.reports.email_sender import (
    EmailMessage,
    EmailSender,
    FakeEmailSender,
    SMTPEmailSender,
)
from app.services.reports.email_report import send_report_email


WEEKLY_SAMPLE: dict = {
    "type": "weekly",
    "project": {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "Casa di Test",
        "description": None,
        "status": "active",
        "budget_cents": 500_000,
        "start_date": "2025-01-01",
        "end_date": "2025-06-01",
    },
    "period": {"start": "2025-02-03", "end": "2025-02-09"},
    "next_week": {"start": "2025-02-10", "end": "2025-02-16"},
    "phases": [],
    "tasks": [],
    "totals": {"task_count": 0, "completed_task_count": 0,
               "estimated_hours": 0.0, "labor_cost_cents": 0},
    "completed_this_week": [],
    "hours_by_phase": [],
    "next_week_plan": [],
    "photos": [],
}


# ---------------------------------------------------------------------------
# EmailSender contract + FakeEmailSender
# ---------------------------------------------------------------------------

def test_email_message_dataclass_fields() -> None:
    msg = EmailMessage(
        to="cust@example.com",
        subject="Weekly report",
        body_html="<p>hi</p>",
        body_text="hi",
        attachments=[("report.pdf", b"%PDF-1.4", "application/pdf")],
    )
    assert msg.to == "cust@example.com"
    assert msg.subject == "Weekly report"
    assert msg.attachments[0][0] == "report.pdf"


def test_fake_email_sender_records_messages() -> None:
    sender = FakeEmailSender()
    msg = EmailMessage(
        to="a@b.com", subject="s", body_html="<p>h</p>", body_text="h",
        attachments=[],
    )
    sender.send(msg)
    assert len(sender.sent) == 1
    assert sender.sent[0] is msg


def test_fake_email_sender_is_emailsender_protocol() -> None:
    assert isinstance(FakeEmailSender(), EmailSender)


def test_smtp_email_sender_is_emailsender_protocol() -> None:
    s = SMTPEmailSender(host="smtp.example.com", port=587, username="u", password="p")
    assert isinstance(s, EmailSender)


def test_fake_email_sender_can_be_configured_to_raise() -> None:
    sender = FakeEmailSender()
    sender.fail_next = RuntimeError("boom")
    msg = EmailMessage(to="x", subject="s", body_html="h", body_text="h", attachments=[])
    with pytest.raises(RuntimeError):
        sender.send(msg)


# ---------------------------------------------------------------------------
# send_report_email — composes HTML, PDF, and dispatches via EmailSender
# ---------------------------------------------------------------------------

class _FakePDFRenderer:
    def __init__(self) -> None:
        self.captured: str | None = None

    def render(self, html: str) -> bytes:
        self.captured = html
        return b"%PDF-1.4 fake\n"


def test_send_report_email_dispatches_via_sender() -> None:
    sender = FakeEmailSender()
    pdf = _FakePDFRenderer()
    send_report_email(
        WEEKLY_SAMPLE,
        recipient="customer@example.com",
        sender=sender,
        pdf_renderer=pdf,
        share_url="https://app.foreman.dev/r/abc",
    )
    assert len(sender.sent) == 1
    sent = sender.sent[0]
    assert sent.to == "customer@example.com"
    assert "Casa di Test" in sent.subject
    assert "Weekly" in sent.subject
    # HTML body links to the share URL
    assert "https://app.foreman.dev/r/abc" in sent.body_html
    # Plain-text body also includes the URL (for clients without HTML support)
    assert "https://app.foreman.dev/r/abc" in sent.body_text
    # PDF attached
    assert len(sent.attachments) == 1
    filename, content, mime = sent.attachments[0]
    assert filename.endswith(".pdf")
    assert content.startswith(b"%PDF-")
    assert mime == "application/pdf"


def test_send_report_email_uses_period_in_attachment_filename() -> None:
    sender = FakeEmailSender()
    send_report_email(
        WEEKLY_SAMPLE,
        recipient="c@example.com",
        sender=sender,
        pdf_renderer=_FakePDFRenderer(),
        share_url="https://x/y",
    )
    name = sender.sent[0].attachments[0][0]
    assert "2025-02-03" in name
    assert "weekly" in name.lower()


def test_send_report_email_works_for_completion_report() -> None:
    sender = FakeEmailSender()
    completion = {
        **WEEKLY_SAMPLE,
        "type": "completion",
        "timeline": {
            "planned_start": "2025-01-01", "planned_end": "2025-03-31",
            "planned_duration_days": 90,
            "actual_start": "2025-01-05", "actual_end": "2025-03-25",
            "actual_duration_days": 80,
        },
        "costs_vs_budget": {
            "budget_cents": 100_000, "actual_cost_cents": 50_000,
            "variance_cents": 50_000, "variance_pct": -50.0, "over_budget": False,
        },
        "phase_summary": [],
        "lessons_learned": [],
    }
    send_report_email(
        completion, recipient="c@example.com", sender=sender,
        pdf_renderer=_FakePDFRenderer(), share_url="https://x/y",
    )
    assert "completion" in sender.sent[0].subject.lower()
    name = sender.sent[0].attachments[0][0]
    assert "completion" in name.lower()


def test_send_report_email_supports_multiple_recipients() -> None:
    sender = FakeEmailSender()
    send_report_email(
        WEEKLY_SAMPLE,
        recipient=["a@example.com", "b@example.com"],
        sender=sender, pdf_renderer=_FakePDFRenderer(),
        share_url="https://x/y",
    )
    # One message per recipient (so each customer sees their own To: line).
    tos = sorted(m.to for m in sender.sent)
    assert tos == ["a@example.com", "b@example.com"]


def test_smtp_sender_uses_injected_smtp_client() -> None:
    """SMTPEmailSender must go through an injected SMTP factory — no real socket."""
    calls: list[dict] = []

    class _FakeSMTP:
        def __init__(self, host: str, port: int) -> None:
            calls.append({"event": "init", "host": host, "port": port})

        def __enter__(self): return self
        def __exit__(self, *a): return False

        def starttls(self) -> None: calls.append({"event": "starttls"})
        def login(self, u: str, p: str) -> None:
            calls.append({"event": "login", "user": u})
        def send_message(self, msg) -> None:
            calls.append({"event": "send", "subject": msg["Subject"], "to": msg["To"]})

    s = SMTPEmailSender(
        host="smtp.example.com", port=587, username="u", password="p",
        smtp_factory=_FakeSMTP, use_starttls=True,
        from_address="reports@foreman.dev",
    )
    s.send(EmailMessage(
        to="cust@example.com", subject="Hi", body_html="<p>h</p>", body_text="h",
        attachments=[("r.pdf", b"%PDF-1.4", "application/pdf")],
    ))
    events = [c["event"] for c in calls]
    assert events == ["init", "starttls", "login", "send"]
    send_call = next(c for c in calls if c["event"] == "send")
    assert send_call["to"] == "cust@example.com"
    assert send_call["subject"] == "Hi"
    init_call = next(c for c in calls if c["event"] == "init")
    assert init_call["host"] == "smtp.example.com"
    assert init_call["port"] == 587
