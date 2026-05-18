"""Bouwmaat scraper tests — fixture-driven."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.services.stores.bouwmaat import BouwmaatClient

FIXTURES = Path(__file__).parent / "fixtures" / "stores"


@pytest.fixture
def search_html() -> str:
    return (FIXTURES / "bouwmaat_search.html").read_text(encoding="utf-8")


def _patch(monkeypatch, body):
    async def fake_get(self, url, **kwargs):
        return httpx.Response(200, text=body, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)


@pytest.mark.asyncio
async def test_parses(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with BouwmaatClient() as c:
        r = await c.search("schroef")
    assert len(r) == 3
    p = r[0]
    assert p.store == "bouwmaat"
    assert p.product_id == "BM-50012"
    assert p.name == "Houtschroef Torx 6x80 (100st)"
    assert p.price_cents == 1899
    assert p.in_stock is True
    assert p.url.startswith("https://www.bouwmaat.nl/")


@pytest.mark.asyncio
async def test_oos(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with BouwmaatClient() as c:
        r = await c.search("beton")
    oos = [x for x in r if not x.in_stock]
    assert len(oos) == 1
    assert oos[0].product_id == "BM-50777"
    assert oos[0].price_cents == 950


@pytest.mark.asyncio
async def test_max(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with BouwmaatClient() as c:
        r = await c.search("x", max_results=2)
    assert len(r) == 2


@pytest.mark.asyncio
async def test_prices_int_cents(search_html, monkeypatch):
    _patch(monkeypatch, search_html)
    async with BouwmaatClient() as c:
        r = await c.search("x")
    for p in r:
        assert isinstance(p.price_cents, int) and not isinstance(p.price_cents, bool)


@pytest.mark.asyncio
async def test_empty(monkeypatch):
    _patch(monkeypatch, "<html></html>")
    async with BouwmaatClient() as c:
        r = await c.search("nope")
    assert r == []


@pytest.mark.live
@pytest.mark.asyncio
async def test_live():  # pragma: no cover
    async with BouwmaatClient() as c:
        r = await c.search("hout")
    assert r
