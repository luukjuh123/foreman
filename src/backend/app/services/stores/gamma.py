"""Gamma (gamma.nl) product-search scraper.

Robots / ToS
------------
gamma.nl/robots.txt allows crawling of public product/search pages while
disallowing checkout/account flows. We hit only public search endpoints,
identify ourselves with a descriptive User-Agent, and never bypass the
:class:`RateLimiter` (default 2 req/s).

Parsing
-------
Search-result articles use stable selectors:

    <article class="product-card" data-product-code="…">
      <h3 class="product-card__title"><a href="/nl/…">…</a></h3>
      <span class="price" data-cents="649">€ 6,49</span>
      <span class="stock-indicator" data-available="true|false">…</span>
    </article>
"""

from __future__ import annotations

import re
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup

from app.services.stores.base import ProductResult, StoreClient


class GammaClient(StoreClient):
    store_name = "gamma"
    base_url = "https://www.gamma.nl"

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("rate_per_second", 2.0)
        super().__init__(**kwargs)  # type: ignore[arg-type]

    async def search(self, query: str, max_results: int = 10) -> list[ProductResult]:
        url = f"{self.base_url}/nl/search?q={quote_plus(query)}"
        html = await self._fetch(url)
        return _parse_search(html, base_url=self.base_url)[:max_results]


_PRICE_TEXT = re.compile(r"€\s*(\d+)[,.](\d{2})")


def _price_cents(node) -> int | None:  # noqa: ANN001
    if node is None:
        return None
    raw = node.get("data-cents")
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    m = _PRICE_TEXT.search(node.get_text(" ", strip=True))
    if m:
        return int(m.group(1)) * 100 + int(m.group(2))
    return None


def _parse_search(html: str, *, base_url: str) -> list[ProductResult]:
    soup = BeautifulSoup(html, "html.parser")
    out: list[ProductResult] = []
    for card in soup.select("article.product-card"):
        code = card.get("data-product-code")
        link = card.select_one("h3.product-card__title a")
        price = _price_cents(card.select_one(".price"))
        stock = card.select_one(".stock-indicator")
        if not (code and link and price is not None):
            continue
        in_stock = bool(stock and (stock.get("data-available") or "").lower() == "true")
        out.append(
            ProductResult(
                store="gamma",
                product_id=str(code),
                name=link.get_text(strip=True),
                url=urljoin(base_url, link.get("href") or ""),
                price_cents=price,
                in_stock=in_stock,
            )
        )
    return out
