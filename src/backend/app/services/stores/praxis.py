"""Praxis (praxis.nl) product-search scraper.

Robots / ToS
------------
praxis.nl/robots.txt allows crawling of public search and product
listing pages. Checkout/cart and account areas are disallowed and we
never hit them. We respect a 2 req/s polite rate limit and identify
ourselves with the foreman-bot User-Agent. Do NOT bypass RateLimiter.

Parsing
-------
Praxis renders prices as separate spans for euros and cents:

    <div class="product-item" data-sku="P-…">
      <a class="product-item__link" href="/p/…">…</a>
      <span class="product-item__price">
        <span class="product-item__price-int">7</span>
        <span class="product-item__price-frac">95</span>
      </span>
      <span class="product-item__stock product-item__stock--in|--out">…</span>
    </div>
"""

from __future__ import annotations

from urllib.parse import quote_plus, urljoin

from app.services.stores.base import ProductResult, StoreClient
from bs4 import BeautifulSoup


class PraxisClient(StoreClient):
    store_name = "praxis"
    base_url = "https://www.praxis.nl"

    def __init__(self, **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]

    async def search(self, query: str, max_results: int = 10) -> list[ProductResult]:
        url = f"{self.base_url}/zoeken?q={quote_plus(query)}"
        html = await self._fetch(url)
        return _parse_search(html, base_url=self.base_url)[:max_results]


def _price_cents(item) -> int | None:
    int_node = item.select_one(".product-item__price-int")
    frac_node = item.select_one(".product-item__price-frac")
    if int_node is None or frac_node is None:
        return None
    try:
        euros = int(int_node.get_text(strip=True))
        cents = int(frac_node.get_text(strip=True))
    except ValueError:
        return None
    if not (0 <= cents < 100):
        return None
    return euros * 100 + cents


def _parse_search(html: str, *, base_url: str) -> list[ProductResult]:
    soup = BeautifulSoup(html, "html.parser")
    out: list[ProductResult] = []
    for item in soup.select("div.product-item"):
        sku = item.get("data-sku")
        link = item.select_one("a.product-item__link")
        stock_el = item.select_one(".product-item__stock")
        price = _price_cents(item)
        if not (sku and link and price is not None):
            continue
        classes = " ".join(stock_el.get("class") or []) if stock_el else ""
        in_stock = "product-item__stock--in" in classes
        out.append(
            ProductResult(
                store="praxis",
                product_id=str(sku),
                name=link.get_text(strip=True),
                url=urljoin(base_url, link.get("href") or ""),
                price_cents=price,
                in_stock=in_stock,
            )
        )
    return out
