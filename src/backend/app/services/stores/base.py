"""Base infrastructure for hardware-store scrapers.

Design
------
* Each store has its own ``StoreClient`` subclass that implements ``search``.
* All HTTP traffic goes through ``StoreClient._fetch`` which:
    - applies a per-instance rate limit (concurrency + min-interval),
    - caches successful responses in an in-memory TTL cache,
    - raises on non-2xx responses.
* Live network tests use the ``live`` pytest marker — skipped by default.
* Prices are integer euro cents; quantities are SI units.

Robots/ToS
----------
Each subclass documents its robots.txt expectations in its module
docstring. Do NOT bypass ``RateLimiter`` — it is the only guard we have
against being banned or breaking polite-crawler expectations.
"""

from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Generic, TypeVar

import httpx

K = TypeVar("K")
V = TypeVar("V")


@dataclass(frozen=True)
class ProductResult:
    """A single product hit from a hardware-store search.

    Prices are integer euro cents (e.g. €12.34 → ``1234``). Never floats.
    """

    store: str
    product_id: str
    name: str
    url: str
    price_cents: int
    in_stock: bool
    unit: str = "piece"
    extra: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.price_cents, int) or isinstance(self.price_cents, bool):
            raise TypeError("price_cents must be an integer (euro cents); never a float")
        if self.price_cents < 0:
            raise ValueError("price_cents must be non-negative")


class TTLCache(Generic[K, V]):
    """Asyncio-safe in-memory TTL cache.

    Drop-in replaceable with a Redis-backed cache that exposes the same
    ``get``/``set``/``clear`` coroutine surface.
    """

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = float(ttl_seconds)
        self._data: dict[K, tuple[float, V]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: K) -> V | None:
        async with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at < time.monotonic():
                self._data.pop(key, None)
                return None
            return value

    async def set(self, key: K, value: V) -> None:
        async with self._lock:
            self._data[key] = (time.monotonic() + self._ttl, value)

    async def clear(self) -> None:
        async with self._lock:
            self._data.clear()


class RateLimiter:
    """Combined concurrency + min-interval limiter.

    Use as ``async with limiter:``. Bounds both simultaneous in-flight
    requests and minimum spacing between successive acquisitions.
    """

    def __init__(self, rate_per_second: float, concurrency: int = 2) -> None:
        if rate_per_second <= 0:
            raise ValueError("rate_per_second must be > 0")
        if concurrency < 1:
            raise ValueError("concurrency must be >= 1")
        self._min_interval = 1.0 / rate_per_second
        self._sem = asyncio.Semaphore(concurrency)
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def __aenter__(self) -> "RateLimiter":
        await self._sem.acquire()
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            self._next_allowed = max(now, self._next_allowed) + self._min_interval
        if wait > 0:
            await asyncio.sleep(wait)
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
        self._sem.release()


class StoreClient(ABC):
    """Abstract base for all hardware-store scrapers.

    Subclasses MUST set ``store_name`` and ``base_url`` and implement
    :meth:`search`. They SHOULD use :meth:`_fetch` for HTTP — it applies
    rate limiting and response caching automatically.
    """

    store_name: str
    base_url: str

    def __init__(
        self,
        rate_per_second: float = 2.0,
        concurrency: int = 2,
        cache_ttl_seconds: float = 3600.0,
        timeout_seconds: float = 10.0,
        user_agent: str = "foreman-bot/0.1 (+https://foreman.dev)",
    ) -> None:
        self._limiter = RateLimiter(rate_per_second=rate_per_second, concurrency=concurrency)
        self._cache: TTLCache[str, str] = TTLCache(ttl_seconds=cache_ttl_seconds)
        self._client = httpx.AsyncClient(
            timeout=timeout_seconds,
            headers={"User-Agent": user_agent, "Accept-Language": "nl-NL,nl;q=0.9"},
            follow_redirects=True,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "StoreClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
        await self.aclose()

    async def _fetch(self, url: str) -> str:
        """Fetch ``url`` and return its body as text. Cached on first hit."""
        cached = await self._cache.get(url)
        if cached is not None:
            return cached

        async with self._limiter:
            response = await self._client.get(url)
        response.raise_for_status()
        body = response.text
        await self._cache.set(url, body)
        return body

    @abstractmethod
    async def search(self, query: str, max_results: int = 10) -> list[ProductResult]:
        """Search the store for ``query``. Returns at most ``max_results`` hits."""
        ...
