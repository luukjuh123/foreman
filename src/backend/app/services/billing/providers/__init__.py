"""Payment-provider abstraction.

The platform supports multiple payment providers behind a single interface so
business logic and the HTTP layer never depend on a concrete vendor.
"""

from app.services.billing.providers.base import (
    CheckoutResult,
    PaymentProvider,
    WebhookEvent,
)


def get_payment_provider() -> PaymentProvider:  # pragma: no cover - DI seam
    """FastAPI dependency that returns the configured PaymentProvider.

    The real implementation reads ``settings`` and constructs a Mollie client.
    Tests override this dependency with a ``FakePaymentProvider``.
    """
    from app.core.config import settings
    from app.services.billing.providers.mollie import MollieProvider

    return MollieProvider(
        api_key=settings.mollie_api_key,
        webhook_secret=settings.mollie_webhook_secret,
    )


__all__ = [
    "CheckoutResult",
    "PaymentProvider",
    "WebhookEvent",
    "get_payment_provider",
]
