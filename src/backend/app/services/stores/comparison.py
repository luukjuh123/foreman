"""Cross-store price comparison engine.

Given a query and a collection of :class:`StoreClient` instances, fans
out parallel searches and returns a single ranked list of
:class:`ProductResult` hits.

Ranking
-------
1. ``in_stock=True`` ranks ahead of ``in_stock=False``.
2. Within each stock bucket, cheapest ``price_cents`` first.
3. Tiebreak: alphabetical store name (stable, deterministic).

Resilience: an exception from one client is logged and that client's
hits are skipped — other clients still contribute.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence

from app.services.stores.base import ProductResult, StoreClient

logger = logging.getLogger(__name__)


def rank_products(products: Sequence[ProductResult]) -> list[ProductResult]:
    """Rank: in-stock first, then cheapest, then store name."""
    return sorted(
        products,
        key=lambda p: (0 if p.in_stock else 1, p.price_cents, p.store),
    )


async def compare_prices(
    query: str,
    clients: Sequence[StoreClient],
    *,
    max_per_store: int = 10,
) -> list[ProductResult]:
    """Search ``query`` on every client concurrently; return ranked hits."""
    if not clients:
        return []

    async def _one(client: StoreClient) -> list[ProductResult]:
        try:
            return await client.search(query, max_results=max_per_store)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "comparison: %s search failed for %r: %s",
                getattr(client, "store_name", type(client).__name__),
                query,
                exc,
            )
            return []

    per_store_results = await asyncio.gather(*(_one(c) for c in clients))
    flat: list[ProductResult] = [p for batch in per_store_results for p in batch]
    return rank_products(flat)
