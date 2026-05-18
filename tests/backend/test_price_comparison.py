"""Tests for the cross-store price comparison engine."""

from __future__ import annotations

import pytest

from app.services.stores.base import ProductResult, StoreClient
from app.services.stores.comparison import compare_prices, rank_products


def _p(store, pid, price, in_stock=True, name="x") -> ProductResult:
    return ProductResult(
        store=store,
        product_id=pid,
        name=name,
        url=f"https://{store}/{pid}",
        price_cents=price,
        in_stock=in_stock,
    )


class TestRankProducts:
    def test_in_stock_before_out_of_stock(self) -> None:
        a = _p("a", "1", 1000, in_stock=False)
        b = _p("b", "2", 1500, in_stock=True)
        ranked = rank_products([a, b])
        assert [r.store for r in ranked] == ["b", "a"]

    def test_cheapest_first_when_both_in_stock(self) -> None:
        a = _p("a", "1", 1500, in_stock=True)
        b = _p("b", "2", 999, in_stock=True)
        c = _p("c", "3", 1200, in_stock=True)
        ranked = rank_products([a, b, c])
        assert [r.store for r in ranked] == ["b", "c", "a"]

    def test_cheapest_first_when_both_out_of_stock(self) -> None:
        a = _p("a", "1", 800, in_stock=False)
        b = _p("b", "2", 500, in_stock=False)
        ranked = rank_products([a, b])
        assert [r.store for r in ranked] == ["b", "a"]

    def test_empty_list(self) -> None:
        assert rank_products([]) == []

    def test_stable_secondary_by_store_name(self) -> None:
        # Tie on price + stock → stable order by store name (alpha).
        a = _p("praxis", "1", 1000, in_stock=True)
        b = _p("gamma", "2", 1000, in_stock=True)
        ranked = rank_products([a, b])
        assert [r.store for r in ranked] == ["gamma", "praxis"]


class _FakeClient(StoreClient):
    """Bypasses real HTTP — returns canned hits per query."""

    base_url = "https://fake"

    def __init__(self, store_name: str, hits: list[ProductResult]) -> None:
        # Don't call super().__init__ — we don't need the real httpx client.
        self.store_name = store_name
        self._hits = hits

    async def search(self, query, max_results=10):  # noqa: ARG002, ANN001
        return list(self._hits[:max_results])

    async def aclose(self) -> None:
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):  # noqa: ANN001
        return None


@pytest.mark.asyncio
async def test_compare_prices_aggregates_and_ranks():
    c1 = _FakeClient("gamma", [_p("gamma", "g1", 1500, True), _p("gamma", "g2", 999, True)])
    c2 = _FakeClient("hornbach", [_p("hornbach", "h1", 1200, True)])
    c3 = _FakeClient("praxis", [_p("praxis", "p1", 800, False)])

    ranked = await compare_prices("cement", clients=[c1, c2, c3])
    assert [r.product_id for r in ranked] == ["g2", "h1", "g1", "p1"]


@pytest.mark.asyncio
async def test_compare_prices_max_per_store_limits_each_client():
    many = [_p("gamma", f"g{i}", 100 + i, True) for i in range(5)]
    c = _FakeClient("gamma", many)
    ranked = await compare_prices("x", clients=[c], max_per_store=2)
    assert len(ranked) == 2


@pytest.mark.asyncio
async def test_compare_prices_handles_client_errors():
    class _Broken(_FakeClient):
        async def search(self, query, max_results=10):
            raise RuntimeError("network down")

    good = _FakeClient("hornbach", [_p("hornbach", "h1", 500, True)])
    bad = _Broken("gamma", [])

    ranked = await compare_prices("x", clients=[good, bad])
    # The broken client must NOT take down the whole comparison.
    assert [r.store for r in ranked] == ["hornbach"]


@pytest.mark.asyncio
async def test_compare_prices_empty_query_returns_empty_when_no_hits():
    c = _FakeClient("gamma", [])
    ranked = await compare_prices("nothing", clients=[c])
    assert ranked == []


@pytest.mark.asyncio
async def test_compare_prices_runs_clients_concurrently():
    # Concurrency contract: the engine awaits clients via gather, so
    # total time ≈ max(client_time) not sum.
    import asyncio
    import time

    class _SlowClient(_FakeClient):
        def __init__(self, store_name, delay, hit):
            super().__init__(store_name, [hit])
            self._delay = delay

        async def search(self, query, max_results=10):
            await asyncio.sleep(self._delay)
            return list(self._hits)

    a = _SlowClient("a", 0.15, _p("a", "1", 100, True))
    b = _SlowClient("b", 0.15, _p("b", "2", 200, True))

    start = time.monotonic()
    ranked = await compare_prices("x", clients=[a, b])
    elapsed = time.monotonic() - start

    assert {r.store for r in ranked} == {"a", "b"}
    assert elapsed < 0.28, f"clients not run concurrently: {elapsed:.3f}s"
