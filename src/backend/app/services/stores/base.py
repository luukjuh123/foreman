"""Base scraper class with rate limiting and caching."""

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import settings


@dataclass
class StoreProduct:
    """A product result from a hardware store."""

    store: str
    product_id: str
    name: str
    url: str
    # Price in euro cents — never float
    price_cents: int
    in_stock: bool
    unit: str = "piece"


class BaseStoreScraper(ABC):
    """Abstract base for hardware store scrapers.

    Enforces rate limiting between requests. All subclasses must call
    `await self._rate_limit()` before any HTTP request.
    """

    store_name: str

    async def _rate_limit(self) -> None:
        """Wait the configured delay between requests."""
        await asyncio.sleep(settings.scraper_rate_limit_delay_seconds)

    @abstractmethod
    async def search(self, query: str, max_results: int = 10) -> list[StoreProduct]:
        """Search for products matching query. Returns euro-cent prices."""
        ...

    @abstractmethod
    async def get_product(self, product_id: str) -> StoreProduct | None:
        """Fetch a single product by its store product ID."""
        ...
