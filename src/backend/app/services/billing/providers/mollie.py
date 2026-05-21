"""Mollie payment provider implementation.

Real network calls happen lazily so that import-time and unit tests don't need
a Mollie API key. Webhook signature verification uses HMAC-SHA256 with the
``MOLLIE_WEBHOOK_SECRET`` shared secret (configured on the Mollie dashboard).
"""

import hashlib
import hmac
import json

import httpx
from app.services.billing.providers.base import (
    CheckoutResult,
    PaymentProvider,
    WebhookEvent,
)

MOLLIE_API_BASE = "https://api.mollie.com/v2"


class MollieProvider(PaymentProvider):
    def __init__(
        self,
        api_key: str,
        webhook_secret: str,
        *,
        base_url: str = MOLLIE_API_BASE,
        webhook_url: str = "https://foreman.example.com/api/v1/billing/webhook/mollie",
        redirect_url: str = "https://foreman.example.com/settings/subscription",
    ) -> None:
        self._api_key = api_key
        self._webhook_secret = webhook_secret
        self._base_url = base_url.rstrip("/")
        self._webhook_url = webhook_url
        self._redirect_url = redirect_url

    # ------------------------------------------------------------------ API
    def create_subscription(
        self, *, customer_email: str, tier: str, amount_cents: int
    ) -> CheckoutResult:
        # 1. Create or look up the customer
        headers = {"Authorization": f"Bearer {self._api_key}"}
        with httpx.Client(timeout=10.0) as cli:
            cust = cli.post(
                f"{self._base_url}/customers",
                headers=headers,
                json={"email": customer_email, "metadata": {"tier": tier}},
            )
            cust.raise_for_status()
            customer_id = cust.json()["id"]

            # 2. Create the first payment (sets up the mandate)
            pay = cli.post(
                f"{self._base_url}/customers/{customer_id}/payments",
                headers=headers,
                json={
                    "amount": {
                        "currency": "EUR",
                        "value": f"{amount_cents / 100:.2f}",
                    },
                    "description": f"foreman {tier} subscription",
                    "sequenceType": "first",
                    "redirectUrl": self._redirect_url,
                    "webhookUrl": self._webhook_url,
                    "metadata": {"tier": tier},
                },
            )
            pay.raise_for_status()
            payment = pay.json()
        return CheckoutResult(
            checkout_url=payment["_links"]["checkout"]["href"],
            provider_subscription_id=payment["id"],
            provider_customer_id=customer_id,
        )

    def cancel_subscription(self, provider_subscription_id: str) -> None:
        headers = {"Authorization": f"Bearer {self._api_key}"}
        with httpx.Client(timeout=10.0) as cli:
            r = cli.delete(
                f"{self._base_url}/subscriptions/{provider_subscription_id}",
                headers=headers,
            )
            r.raise_for_status()

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        if not signature:
            return False
        expected = hmac.new(
            self._webhook_secret.encode(), payload, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def parse_webhook(self, payload: bytes) -> WebhookEvent:
        body = json.loads(payload.decode())
        # Mollie posts {"id": "tr_xxx"} and the consumer fetches details;
        # to keep the integration simple we accept an inline status field too.
        return WebhookEvent(
            provider_subscription_id=body["id"],
            status=body.get("status", "active"),
        )
