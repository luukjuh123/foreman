"""Email-sending abstraction for foreman reports.

* ``EmailMessage`` — plain dataclass payload, no transport logic.
* ``EmailSender`` — runtime-checkable Protocol; routers + services depend
  on this, never directly on SMTP.
* ``FakeEmailSender`` — records sent messages; used in tests and dev mode.
* ``SMTPEmailSender`` — production implementation. Takes an
  ``smtp_factory`` (defaults to ``smtplib.SMTP``) so tests can inject a
  fake without opening real sockets.

Configuration (host / port / credentials / from-address) is injected by
the caller — keeps the sender free of process-level env coupling so it's
trivially testable.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from email.message import EmailMessage as PyEmailMessage
from typing import Protocol, runtime_checkable


@dataclass
class EmailMessage:
    """A composed email ready to hand to an ``EmailSender``."""

    to: str
    subject: str
    body_html: str
    body_text: str
    # (filename, content, mime_type)
    attachments: list[tuple[str, bytes, str]] = field(default_factory=list)


@runtime_checkable
class EmailSender(Protocol):
    """Anything that can deliver an ``EmailMessage``."""

    def send(self, message: EmailMessage) -> None:  # pragma: no cover - protocol
        ...


class FakeEmailSender:
    """In-memory ``EmailSender`` for tests / dev.

    Set ``fail_next`` to an exception to make the next ``send()`` raise it
    (then clear). Useful for testing error paths.
    """

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []
        self.fail_next: BaseException | None = None

    def send(self, message: EmailMessage) -> None:
        if self.fail_next is not None:
            exc, self.fail_next = self.fail_next, None
            raise exc
        self.sent.append(message)


class SMTPEmailSender:
    """SMTP-backed ``EmailSender``.

    ``smtp_factory`` is the callable used to construct the SMTP client
    (``smtplib.SMTP`` by default) — tests inject a fake here.
    """

    def __init__(
        self,
        *,
        host: str,
        port: int,
        username: str,
        password: str,
        from_address: str = "noreply@foreman.dev",
        use_starttls: bool = True,
        smtp_factory: Callable[[str, int], object] | None = None,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._from = from_address
        self._use_starttls = use_starttls
        self._smtp_factory = smtp_factory

    def _resolve_factory(self) -> Callable[[str, int], object]:
        if self._smtp_factory is not None:
            return self._smtp_factory
        import smtplib  # local import keeps test envs without smtplib happy
        return smtplib.SMTP

    def _build_mime(self, message: EmailMessage) -> PyEmailMessage:
        mime = PyEmailMessage()
        mime["From"] = self._from
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.body_text)
        mime.add_alternative(message.body_html, subtype="html")
        for filename, content, mime_type in message.attachments:
            maintype, _, subtype = mime_type.partition("/")
            mime.add_attachment(
                content, maintype=maintype or "application",
                subtype=subtype or "octet-stream", filename=filename,
            )
        return mime

    def send(self, message: EmailMessage) -> None:
        factory = self._resolve_factory()
        client = factory(self._host, self._port)
        with client as conn:  # type: ignore[attr-defined]
            if self._use_starttls:
                conn.starttls()
            conn.login(self._username, self._password)
            conn.send_message(self._build_mime(message))
