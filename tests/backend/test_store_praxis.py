"""Praxis scraper tests — fixture-driven."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.services.stores.praxis import PraxisClient

FIXTURES = Path(__file__).parent / "fixtures" / "stores"


@pytest.fixture
def search_html() -> str:
    return (FIXTURES / "praxis_search.html").read_text(encoding="utf-8")


def _patch(monkeypatch, body):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=body, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)


@pytest.mark.asyncio
async def test_parses_products(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with PraxisClient() as c:
        r = await c.search("schroef")
    assert len(r) == 3
    assert r[0].store == "praxis"
    assert r[0].product_id == "P-987001"
    assert r[0].name == "Spaanplaatschroef 4x50 (250st)"
    # €7,95 → 795 cents (price built from int + frac spans)
    assert r[0].price_cents == 795
    assert r[0].in_stock is True
    assert r[0].url.startswith("https://www.praxis.nl/")


@pytest.mark.asyncio
async def test_oos_flagged(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with PraxisClient() as c:
        r = await c.search("gips")
    oos = [x for x in r if not x.in_stock]
    assert len(oos) == 1
    assert oos[0].product_id == "P-987444"
    assert oos[0].price_cents == 1450


@pytest.mark.asyncio
async def test_max_results(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with PraxisClient() as c:
        r = await c.search("x", max_results=2)
    assert len(r) == 2


@pytest.mark.asyncio
async def test_prices_integer_cents(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with PraxisClient() as c:
        r = await c.search("x")
    for p in r:
        assert isinstance(p.price_cents, int) and not isinstance(p.price_cents, bool)


@pytest.mark.asyncio
async def test_empty(monkeypatch):
    _patch(monkeypatch, "<html></html>")
    async with PraxisClient() as c:
        r = await c.search("nope")
    assert r == []


@pytest.mark.live
@pytest.mark.asyncio
async def test_live():  # pragma: no cover
    async with PraxisClient() as c:
        r = await c.search("hout")
    assert r
