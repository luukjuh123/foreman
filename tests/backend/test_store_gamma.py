"""Gamma scraper tests — fixture-driven, no live HTTP."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.services.stores.gamma import GammaClient

FIXTURES = Path(__file__).parent / "fixtures" / "stores"


@pytest.fixture
def search_html() -> str:
    return (FIXTURES / "gamma_search.html").read_text(encoding="utf-8")


def _patch(monkeypatch, body: str) -> None:
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=body, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)


@pytest.mark.asyncio
async def test_search_parses_products(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with GammaClient() as c:
        results = await c.search("schroef")
    assert len(results) == 3
    first = results[0]
    assert first.store == "gamma"
    assert first.product_id == "G-200145"
    assert first.name == "Spax houtschroef 4x40 (100st)"
    assert first.price_cents == 649
    assert first.in_stock is True
    assert first.url.startswith("https://www.gamma.nl/")


@pytest.mark.asyncio
async def test_out_of_stock_flagged(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with GammaClient() as c:
        results = await c.search("mortel")
    assert any(not r.in_stock and r.product_id == "G-200999" for r in results)


@pytest.mark.asyncio
async def test_max_results_caps(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with GammaClient() as c:
        results = await c.search("x", max_results=1)
    assert len(results) == 1


@pytest.mark.asyncio
async def test_prices_integer_cents(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with GammaClient() as c:
        results = await c.search("x")
    for r in results:
        assert isinstance(r.price_cents, int)
        assert not isinstance(r.price_cents, bool)


@pytest.mark.asyncio
async def test_empty(monkeypatch):
    _patch(monkeypatch, "<html><body>geen treffers</body></html>")
    async with GammaClient() as c:
        results = await c.search("nonexistent")
    assert results == []


@pytest.mark.live
@pytest.mark.asyncio
async def test_live():  # pragma: no cover
    async with GammaClient() as c:
        results = await c.search("verf")
    assert results
