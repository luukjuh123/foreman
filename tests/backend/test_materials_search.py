"""Tests for the wired /materials/search endpoint (Phase 12)."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.stores.base import ProductResult


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_search_returns_empty_list_for_blank_query(client):
    """Blank query still returns a valid response shape."""
    response = await client.get("/api/v1/materials/search", params={"query": ""})
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert isinstance(body["data"], list)
    assert body["error"] is None


@pytest.mark.asyncio
async def test_search_response_shape_with_mocked_compare(client, monkeypatch):
    """compare_prices is called and its results are serialised correctly."""
    fake_results = [
        ProductResult(
            store="hornbach",
            product_id="h-001",
            name="Spijker 40mm (1kg)",
            url="https://www.hornbach.nl/p/spijker/h-001/",
            price_cents=499,
            in_stock=True,
        ),
        ProductResult(
            store="gamma",
            product_id="g-002",
            name="Spijker universeel",
            url="https://www.gamma.nl/assortiment/p/spijker/g-002",
            price_cents=349,
            in_stock=False,
        ),
    ]

    async def fake_compare(query, clients, **kwargs):
        return fake_results

    monkeypatch.setattr(
        "app.routers.materials.compare_prices",
        fake_compare,
    )

    response = await client.get("/api/v1/materials/search", params={"query": "spijker"})
    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["query"] == "spijker"

    data = body["data"]
    assert len(data) == 2

    first = data[0]
    assert first["store"] == "hornbach"
    assert first["product_id"] == "h-001"
    assert first["name"] == "Spijker 40mm (1kg)"
    assert first["price_cents"] == 499
    assert first["in_stock"] is True
    assert first["url"] == "https://www.hornbach.nl/p/spijker/h-001/"

    second = data[1]
    assert second["store"] == "gamma"
    assert second["in_stock"] is False


@pytest.mark.asyncio
async def test_search_missing_query_param_uses_empty_string(client, monkeypatch):
    """query param is optional; omitting it defaults to empty string."""
    called_with: list[str] = []

    async def fake_compare(query, clients, **kwargs):
        called_with.append(query)
        return []

    monkeypatch.setattr(
        "app.routers.materials.compare_prices",
        fake_compare,
    )

    response = await client.get("/api/v1/materials/search")
    assert response.status_code == 200
    assert called_with == [""]


@pytest.mark.asyncio
async def test_search_store_failure_still_returns_partial_results(client, monkeypatch):
    """If compare_prices returns partial results (one store failed), endpoint succeeds."""
    partial_results = [
        ProductResult(
            store="praxis",
            product_id="p-001",
            name="Schroef 50mm",
            url="https://www.praxis.nl/p/schroef/p-001",
            price_cents=199,
            in_stock=True,
        ),
    ]

    async def fake_compare(query, clients, **kwargs):
        return partial_results

    monkeypatch.setattr(
        "app.routers.materials.compare_prices",
        fake_compare,
    )

    response = await client.get("/api/v1/materials/search", params={"query": "schroef"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["store"] == "praxis"


@pytest.mark.asyncio
async def test_search_query_passed_through_to_compare(client, monkeypatch):
    """The query string is forwarded verbatim to compare_prices."""
    received: list[str] = []

    async def fake_compare(query, clients, **kwargs):
        received.append(query)
        return []

    monkeypatch.setattr(
        "app.routers.materials.compare_prices",
        fake_compare,
    )

    await client.get("/api/v1/materials/search", params={"query": "bouwschroef M6"})
    assert received == ["bouwschroef M6"]
