"""Webhook HTTP delivery with HMAC-SHA256 signature and exponential backoff retry.

Delivers a JSON payload to a caller-supplied URL. When a secret is provided,
the request includes an X-Foreman-Signature header (HMAC-SHA256 hex digest of
the raw body keyed with the secret).

Retries up to MAX_ATTEMPTS times with exponential backoff on failure.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import UTC, datetime

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10
MAX_ATTEMPTS = 3
_BASE_BACKOFF_SECONDS = 1.0


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

    Retries up to MAX_ATTEMPTS times with exponential backoff.
    Failures are logged but not re-raised — webhook delivery is best-effort.
    """
    envelope = {
        "event": event,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": payload,
    }
    body = json.dumps(envelope, separators=(",", ":")).encode()
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "X-Foreman-Event": event,
        "User-Agent": "Foreman-Webhook/1.0",
    }
    if secret:
        headers["X-Foreman-Signature"] = f"sha256={compute_signature(body, secret)}"

    last_exc: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        start_ms = int(time.monotonic() * 1000)
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, content=body, headers=headers)
                elapsed_ms = int(time.monotonic() * 1000) - start_ms
                if resp.status_code >= 400:
                    logger.warning(
                        "Webhook delivery failed",
                        extra={"url": url, "status": resp.status_code, "attempt": attempt},
                    )
                    if attempt < MAX_ATTEMPTS:
                        await asyncio.sleep(_BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                    continue
                logger.debug(
                    "Webhook delivered",
                    extra={"url": url, "status": resp.status_code, "elapsed_ms": elapsed_ms},
                )
                return
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "Webhook delivery error",
                extra={"url": url, "error": str(exc), "attempt": attempt},
            )
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(_BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))

    if last_exc:
        logger.error("Webhook delivery exhausted all attempts", extra={"url": url, "error": str(last_exc)})
