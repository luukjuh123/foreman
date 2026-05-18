"""Hornbach scraper tests.

Uses recorded HTML fixtures — does not touch hornbach.nl. Live tests
must be opted in with ``-m live``.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.services.stores.hornbach import HornbachClient

FIXTURES = Path(__file__).parent / "fixtures" / "stores"


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def search_html() -> str:
    return _load("hornbach_search.html")


@pytest.mark.asyncio
async def test_search_parses_products(search_html, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=search_html, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async with HornbachClient() as c:
        results = await c.search("spijker")

    assert len(results) == 3
    first = results[0]
    assert first.store == "hornbach"
    assert first.product_id == "8123456"
    assert first.name == "Spijker stalen 40mm (1kg)"
    assert first.price_cents == 499
    assert first.in_stock is True
    assert first.url.startswith("https://www.hornbach.nl/p/")


@pytest.mark.asyncio
async def test_out_of_stock_flagged(search_html, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=search_html, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async with HornbachClient() as c:
        results = await c.search("schroef")

    oos = [r for r in results if not r.in_stock]
    assert len(oos) == 1
    assert oos[0].product_id == "8123999"


@pytest.mark.asyncio
async def test_max_results_caps(search_html, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=search_html, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async with HornbachClient() as c:
        results = await c.search("hornbach", max_results=2)

    assert len(results) == 2


@pytest.mark.asyncio
async def test_prices_are_integer_cents(search_html, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=search_html, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async with HornbachClient() as c:
        results = await c.search("anything")

    for r in results:
        assert isinstance(r.price_cents, int)
        assert not isinstance(r.price_cents, bool)


@pytest.mark.asyncio
async def test_empty_results(monkeypatch):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text="<html><body>geen resultaten</body></html>",
                              request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async with HornbachClient() as c:
        results = await c.search("nonexistent-thing-xyz")

    assert results == []


@pytest.mark.live
@pytest.mark.asyncio
async def test_live_search_real_site():  # pragma: no cover
    async with HornbachClient() as c:
        results = await c.search("cement")
    assert any(r.price_cents > 0 for r in results)
