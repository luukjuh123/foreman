"""Signed tokens for shareable customer-facing report links.

Tokens are compact URL-safe strings of the form ``<payload>.<signature>``.
``payload`` is the URL-safe base64 of the report UUID (string form) and
``signature`` is HMAC-SHA256(secret, payload-bytes) in URL-safe base64.

We deliberately stick to stdlib primitives — easier to audit than pulling
in itsdangerous.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import uuid


class InvalidReportToken(Exception):
    """Raised when a report-share token cannot be verified."""


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(payload: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    return _b64encode(digest)


def sign_report_token(report_id: uuid.UUID, secret: str) -> str:
    """Produce a tamper-evident share token for ``report_id``."""
    payload = str(report_id).encode("ascii")
    signature = _sign(payload, secret)
    return f"{_b64encode(payload)}.{signature}"


def verify_report_token(token: str, secret: str) -> uuid.UUID:
    """Verify a token and return the encoded report UUID.

    Raises ``InvalidReportToken`` for any malformed, tampered, or
    wrong-secret token.
    """
    if not token or token.count(".") != 1:
        raise InvalidReportToken("malformed token")
    payload_b64, signature = token.split(".")
    if not payload_b64 or not signature:
        raise InvalidReportToken("malformed token")
    try:
        payload = _b64decode(payload_b64)
    except (ValueError, binascii.Error) as exc:
        raise InvalidReportToken("payload decode failed") from exc

    expected = _sign(payload, secret)
    if not hmac.compare_digest(signature, expected):
        raise InvalidReportToken("signature mismatch")

    try:
        return uuid.UUID(payload.decode("ascii"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InvalidReportToken("payload is not a UUID") from exc
