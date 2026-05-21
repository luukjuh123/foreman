"""Abstract PaymentProvider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class CheckoutResult:
    checkout_url: str
    provider_subscription_id: str
    provider_customer_id: str


@dataclass(frozen=True)
class WebhookEvent:
    provider_subscription_id: str
    status: str  # active | cancelled | past_due | trialing


class PaymentProvider(ABC):
    """Interface for payment / subscription providers (Mollie, Stripe, ...)."""

    @abstractmethod
    def create_subscription(self, *, customer_email: str, tier: str, amount_cents: int) -> CheckoutResult:
        """Create a subscription / checkout session and return the redirect URL."""

    @abstractmethod
    def cancel_subscription(self, provider_subscription_id: str) -> None:
        """Cancel a subscription at the provider."""

    @abstractmethod
    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """Return ``True`` iff ``signature`` is a valid HMAC for ``payload``."""

    @abstractmethod
    def parse_webhook(self, payload: bytes) -> WebhookEvent:
        """Translate a provider-specific payload into a ``WebhookEvent``."""
