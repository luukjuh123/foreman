"""Hornbach (hornbach.nl) product-search scraper.

Robots / ToS
------------
Hornbach's robots.txt (https://www.hornbach.nl/robots.txt) disallows
crawling of session/cart/checkout pages but search and product pages
are not disallowed. We still honour a conservative rate limit (2 req/s)
and identify ourselves with a descriptive User-Agent. Do NOT bypass
:class:`RateLimiter`.

Parsing
-------
Hornbach search result pages render product cards with stable
data attributes:

    <li class="product-tile" data-article-id="…">
      <a class="product-tile__title" href="/p/slug/article-id/">…</a>
      <div class="product-tile__price" data-price-cents="499">…</div>
      <div class="availability availability--in-stock">…</div>
    </li>

If Hornbach redesigns these selectors, update :func:`_parse_search` and
add a fresh fixture under ``tests/backend/fixtures/stores/``.
"""

from __future__ import annotations

import re
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup

from app.services.stores.base import ProductResult, StoreClient


class HornbachClient(StoreClient):
    store_name = "hornbach"
    base_url = "https://www.hornbach.nl"

    def __init__(self, **kwargs: object) -> None:
        # 2 requests per second per the polite-crawler default.
        kwargs.setdefault("rate_per_second", 2.0)
        super().__init__(**kwargs)  # type: ignore[arg-type]

    async def search(self, query: str, max_results: int = 10) -> list[ProductResult]:
        url = f"{self.base_url}/s/?q={quote_plus(query)}"
        html = await self._fetch(url)
        return _parse_search(html, base_url=self.base_url)[:max_results]


_PRICE_FALLBACK = re.compile(r"€\s*(\d+)[,.](\d{2})")


def _parse_price_cents(node) -> int | None:  # noqa: ANN001
    """Extract price in integer euro cents from a price node.

    Prefers ``data-price-cents`` (authoritative integer); falls back to
    text like ``"€4,99"`` parsed into cents.
    """
    if node is None:
        return None
    raw = node.get("data-price-cents")
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    text = node.get_text(" ", strip=True)
    m = _PRICE_FALLBACK.search(text)
    if m:
        return int(m.group(1)) * 100 + int(m.group(2))
    return None


def _parse_search(html: str, *, base_url: str) -> list[ProductResult]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[ProductResult] = []
    for tile in soup.select("li.product-tile"):
        article_id = tile.get("data-article-id")
        title_a = tile.select_one("a.product-tile__title")
        price_node = tile.select_one(".product-tile__price")
        avail = tile.select_one(".availability")

        if not (article_id and title_a and price_node):
            continue

        price = _parse_price_cents(price_node)
        if price is None:
            continue

        in_stock = bool(avail and "in-stock" in " ".join(avail.get("class") or []))
        href = title_a.get("href") or ""
        results.append(
            ProductResult(
                store="hornbach",
                product_id=str(article_id),
                name=title_a.get_text(strip=True),
                url=urljoin(base_url, href),
                price_cents=price,
                in_stock=in_stock,
            )
        )
    return results
