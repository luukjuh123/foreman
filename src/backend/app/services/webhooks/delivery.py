"""Webhook HTTP delivery with optional HMAC-SHA256 signature.

Delivers a JSON payload to a caller-supplied URL. When a secret is provided,
the request includes an X-Foreman-Signature header (HMAC-SHA256 hex digest of
the raw body keyed with the secret).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10


def compute_signature(body: bytes, secret: str) -> str:
    """Return the HMAC-SHA256 hex digest of *body* using *secret*."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def deliver_webhook(
    url: str,
    event: str,
    payload: dict,
    secret: str | None,
) -> None:
    """POST *payload* to *url* with optional HMAC signature.

    Failures are logged but not re-raised — webhook delivery is best-effort.
    """
    body = json.dumps({"event": event, "data": payload}, separators=(",", ":")).encode()
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "X-Foreman-Event": event,
        "User-Agent": "Foreman-Webhook/1.0",
    }
    if secret:
        headers["X-Foreman-Signature"] = f"sha256={compute_signature(body, secret)}"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, content=body, headers=headers)
            if resp.status_code >= 400:
                logger.warning("Webhook delivery failed", extra={"url": url, "status": resp.status_code})
    except Exception as exc:
        logger.warning("Webhook delivery error", extra={"url": url, "error": str(exc)})
