"""Tests for the hardware-store scraper base infrastructure.

These tests cover the rate limiter, TTL cache and abstract StoreClient
interface. They MUST NOT hit any live store — all HTTP is monkey-patched.
"""

from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from app.services.stores.base import (
    ProductResult,
    RateLimiter,
    StoreClient,
    TTLCache,
)


class TestProductResult:
    def test_price_must_be_integer_cents(self) -> None:
        with pytest.raises(TypeError):
            ProductResult(
                store="x",
                product_id="1",
                name="n",
                url="http://x",
                price_cents=1.23,
                in_stock=True,
            )

    def test_negative_price_rejected(self) -> None:
        with pytest.raises(ValueError):
            ProductResult(
                store="x",
                product_id="1",
                name="n",
                url="http://x",
                price_cents=-1,
                in_stock=True,
            )

    def test_valid_product(self) -> None:
        p = ProductResult(
            store="hornbach",
            product_id="abc",
            name="Spijker 4mm",
            url="https://hornbach.nl/p/abc",
            price_cents=499,
            in_stock=True,
        )
        assert p.price_cents == 499
        assert p.unit == "piece"


class TestTTLCache:
    @pytest.mark.asyncio
    async def test_set_and_get(self) -> None:
        cache = TTLCache(ttl_seconds=10)
        await cache.set("k", "v")
        assert await cache.get("k") == "v"

    @pytest.mark.asyncio
    async def test_miss_returns_none(self) -> None:
        cache = TTLCache(ttl_seconds=10)
        assert await cache.get("absent") is None

    @pytest.mark.asyncio
    async def test_expiry(self) -> None:
        cache = TTLCache(ttl_seconds=0.01)
        await cache.set("k", "v")
        await asyncio.sleep(0.05)
        assert await cache.get("k") is None

    @pytest.mark.asyncio
    async def test_clear(self) -> None:
        cache = TTLCache(ttl_seconds=10)
        await cache.set("a", "1")
        await cache.set("b", "2")
        await cache.clear()
        assert await cache.get("a") is None
        assert await cache.get("b") is None


class TestRateLimiter:
    @pytest.mark.asyncio
    async def test_enforces_min_interval(self) -> None:
        rl = RateLimiter(rate_per_second=5.0, concurrency=2)
        start = time.monotonic()
        for _ in range(3):
            async with rl:
                pass
        elapsed = time.monotonic() - start
        assert elapsed >= 0.35

    @pytest.mark.asyncio
    async def test_concurrency_cap(self) -> None:
        rl = RateLimiter(rate_per_second=1000.0, concurrency=1)
        active = 0
        peak = 0

        async def task() -> None:
            nonlocal active, peak
            async with rl:
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(0.02)
                active -= 1

        await asyncio.gather(*(task() for _ in range(4)))
        assert peak == 1

    def test_rate_must_be_positive(self) -> None:
        with pytest.raises(ValueError):
            RateLimiter(rate_per_second=0)

    def test_concurrency_must_be_positive(self) -> None:
        with pytest.raises(ValueError):
            RateLimiter(rate_per_second=1, concurrency=0)


class _FakeClient(StoreClient):
    store_name = "fake"
    base_url = "https://fake.test"

    def __init__(self) -> None:
        super().__init__(rate_per_second=100.0, concurrency=4, cache_ttl_seconds=60)

    async def search(self, query, max_results=10):
        html = await self._fetch(f"{self.base_url}/search?q={query}")
        return [
            ProductResult(
                store=self.store_name,
                product_id=str(len(html)),
                name=query,
                url=f"{self.base_url}/p/{len(html)}",
                price_cents=100,
                in_stock=True,
            )
        ]


class TestStoreClient:
    @pytest.mark.asyncio
    async def test_fetch_uses_cache(self, monkeypatch):
        calls = {"n": 0}

        async def fake_get(self, url, **kwargs):
            calls["n"] += 1
            return httpx.Response(200, text=f"<html>{url}</html>", request=httpx.Request("GET", url))

        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

        c = _FakeClient()
        try:
            r1 = await c.search("hamer")
            r2 = await c.search("hamer")
        finally:
            await c.aclose()

        assert r1 == r2
        assert calls["n"] == 1

    @pytest.mark.asyncio
    async def test_fetch_raises_on_http_error(self, monkeypatch):
        async def fake_get(self, url, **kwargs):
            return httpx.Response(500, text="boom", request=httpx.Request("GET", url))

        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

        c = _FakeClient()
        try:
            with pytest.raises(httpx.HTTPStatusError):
                await c.search("zaag")
        finally:
            await c.aclose()

    @pytest.mark.asyncio
    async def test_context_manager_closes(self, monkeypatch):
        async def fake_get(self, url, **kwargs):
            return httpx.Response(200, text="<html/>", request=httpx.Request("GET", url))

        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
        async with _FakeClient() as c:
            await c.search("kit")
        # No exception → close worked.

    def test_abstract_search_required(self) -> None:
        class Incomplete(StoreClient):
            store_name = "x"
            base_url = "https://x"

        with pytest.raises(TypeError):
            Incomplete()
