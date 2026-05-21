"""In-memory fake PaymentProvider used in tests."""

import hashlib
import hmac
import json
import uuid

from app.services.billing.providers.base import (
    CheckoutResult,
    PaymentProvider,
    WebhookEvent,
)


class FakePaymentProvider(PaymentProvider):
    def __init__(self, webhook_secret: str = "test-webhook-secret") -> None:
        self._webhook_secret = webhook_secret
        self.subscriptions: dict[str, dict] = {}
        self.cancelled: set[str] = set()

    def create_subscription(self, *, customer_email: str, tier: str, amount_cents: int) -> CheckoutResult:
        sub_id = f"sub_{uuid.uuid4().hex[:12]}"
        cust_id = f"cst_{uuid.uuid4().hex[:12]}"
        self.subscriptions[sub_id] = {
            "customer_email": customer_email,
            "tier": tier,
            "amount_cents": amount_cents,
            "customer_id": cust_id,
        }
        return CheckoutResult(
            checkout_url=f"https://fake-checkout.local/{sub_id}",
            provider_subscription_id=sub_id,
            provider_customer_id=cust_id,
        )

    def cancel_subscription(self, provider_subscription_id: str) -> None:
        self.cancelled.add(provider_subscription_id)

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        expected = hmac.new(self._webhook_secret.encode(), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def parse_webhook(self, payload: bytes) -> WebhookEvent:
        body = json.loads(payload.decode())
        return WebhookEvent(
            provider_subscription_id=body["id"],
            status=body.get("status", "active"),
        )
