"""Tests for /materials/search, /materials/compare, and /materials/stores endpoints.

All tests mock compare_prices so no live HTTP is made.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services.stores.base import ProductResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _p(
    store: str,
    pid: str,
    price: int,
    in_stock: bool = True,
    name: str = "Test Product",
    unit: str = "piece",
) -> ProductResult:
    return ProductResult(
        store=store,
        product_id=pid,
        name=name,
        url=f"https://{store}.nl/p/{pid}",
        price_cents=price,
        in_stock=in_stock,
        unit=unit,
    )


FAKE_RESULTS = [
    _p("hornbach", "h1", 599, in_stock=True, name="Muurverf wit 10L"),
    _p("gamma", "g1", 799, in_stock=True, name="Gamma Muurverf 10L"),
    _p("praxis", "p1", 699, in_stock=False, name="Praxis Verf 10L"),
    _p("bouwmaat", "b1", 549, in_stock=True, name="Bouwmaat Verf 10L"),
]


# ---------------------------------------------------------------------------
# /materials/stores
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stores_returns_list_of_store_names(client):
    response = await client.get("/api/v1/materials/stores")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "error" in body
    assert body["error"] is None
    stores = body["data"]
    assert isinstance(stores, list)
    assert set(stores) == {"hornbach", "gamma", "praxis", "bouwmaat"}


# ---------------------------------------------------------------------------
# /materials/search
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_returns_ranked_list(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=FAKE_RESULTS,
    ):
        response = await client.get("/api/v1/materials/search?query=verf&max_results=20")

    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "error" in body
    assert body["error"] is None

    results = body["data"]
    assert isinstance(results, list)
    assert len(results) == 4

    first = results[0]
    assert first["store"] == "hornbach"
    assert first["product_id"] == "h1"
    assert first["name"] == "Muurverf wit 10L"
    assert first["price_cents"] == 599
    assert first["in_stock"] is True
    assert first["url"] == "https://hornbach.nl/p/h1"


@pytest.mark.asyncio
async def test_search_product_result_has_required_fields(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=FAKE_RESULTS[:1],
    ):
        response = await client.get("/api/v1/materials/search?query=verf")

    assert response.status_code == 200
    item = response.json()["data"][0]
    for key in ("store", "product_id", "name", "url", "price_cents", "in_stock", "unit"):
        assert key in item, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_search_empty_query_returns_empty_list(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=[],
    ):
        response = await client.get("/api/v1/materials/search?query=")

    assert response.status_code == 200
    assert response.json() == {"data": [], "error": None}


@pytest.mark.asyncio
async def test_search_passes_max_results_to_comparison(client):
    captured: dict = {}

    async def _mock(query, clients, *, max_per_store=10):
        captured["max_per_store"] = max_per_store
        return []

    with patch("app.routers.materials.compare_prices", side_effect=_mock):
        response = await client.get("/api/v1/materials/search?query=verf&max_results=5")

    assert response.status_code == 200
    assert captured["max_per_store"] == 5


@pytest.mark.asyncio
async def test_search_default_max_results_is_ten(client):
    captured: dict = {}

    async def _mock(query, clients, *, max_per_store=10):
        captured["max_per_store"] = max_per_store
        return []

    with patch("app.routers.materials.compare_prices", side_effect=_mock):
        response = await client.get("/api/v1/materials/search?query=verf")

    assert response.status_code == 200
    assert captured["max_per_store"] == 10


# ---------------------------------------------------------------------------
# /materials/compare
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compare_returns_grouped_and_ranked(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=FAKE_RESULTS,
    ):
        response = await client.get("/api/v1/materials/compare?query=verf")

    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "error" in body
    assert body["error"] is None

    data = body["data"]
    assert data["query"] == "verf"
    assert "results_by_store" in data
    assert "ranked" in data


@pytest.mark.asyncio
async def test_compare_groups_by_store(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=FAKE_RESULTS,
    ):
        response = await client.get("/api/v1/materials/compare?query=verf")

    data = response.json()["data"]
    by_store = data["results_by_store"]

    assert "hornbach" in by_store
    assert "gamma" in by_store
    assert "praxis" in by_store
    assert "bouwmaat" in by_store

    assert len(by_store["hornbach"]) == 1
    assert by_store["hornbach"][0]["product_id"] == "h1"

    assert len(by_store["gamma"]) == 1
    assert by_store["gamma"][0]["product_id"] == "g1"


@pytest.mark.asyncio
async def test_compare_ranked_list_is_same_order_as_search(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=FAKE_RESULTS,
    ):
        response = await client.get("/api/v1/materials/compare?query=verf")

    data = response.json()["data"]
    ranked_ids = [r["product_id"] for r in data["ranked"]]
    assert ranked_ids == ["h1", "g1", "p1", "b1"]


@pytest.mark.asyncio
async def test_compare_empty_results(client):
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=[],
    ):
        response = await client.get("/api/v1/materials/compare?query=nothing")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["query"] == "nothing"
    assert data["results_by_store"] == {}
    assert data["ranked"] == []


@pytest.mark.asyncio
async def test_compare_multiple_results_per_store(client):
    results = [
        _p("hornbach", "h1", 500, in_stock=True, name="Prod A"),
        _p("hornbach", "h2", 600, in_stock=True, name="Prod B"),
        _p("gamma", "g1", 450, in_stock=True, name="Prod C"),
    ]
    with patch(
        "app.routers.materials.compare_prices",
        new_callable=AsyncMock,
        return_value=results,
    ):
        response = await client.get("/api/v1/materials/compare?query=test")

    data = response.json()["data"]
    assert len(data["results_by_store"]["hornbach"]) == 2
    assert len(data["results_by_store"]["gamma"]) == 1
