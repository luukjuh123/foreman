"""Bouwmaat (bouwmaat.nl) product-search scraper.

Bouwmaat is a B2B / pro-customer hardware store. Their public catalog
is browseable; checkout pricing may vary per logged-in customer. We
only scrape the public, anonymous incl-BTW (incl. VAT) prices.

Robots / ToS
------------
bouwmaat.nl/robots.txt does not disallow the public product/search
pages. We respect a polite 2 req/s rate limit and identify ourselves
with the foreman-bot User-Agent. Do NOT bypass RateLimiter.

Parsing
-------
    <div class="bm-product" data-product-nr="BM-…">
      <a class="bm-product__name" href="/product/…">…</a>
      <div class="bm-product__price" data-price-incl-vat-cents="…">…</div>
      <div class="bm-product__stock" data-in-stock="1|0">…</div>
    </div>
"""

from __future__ import annotations

import re
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup

from app.services.stores.base import ProductResult, StoreClient


class BouwmaatClient(StoreClient):
    store_name = "bouwmaat"
    base_url = "https://www.bouwmaat.nl"

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("rate_per_second", 2.0)
        super().__init__(**kwargs)  # type: ignore[arg-type]

    async def search(self, query: str, max_results: int = 10) -> list[ProductResult]:
        url = f"{self.base_url}/zoeken?q={quote_plus(query)}"
        html = await self._fetch(url)
        return _parse_search(html, base_url=self.base_url)[:max_results]


_PRICE_TEXT = re.compile(r"€\s*(\d+)[,.](\d{2})")


def _price_cents(node) -> int | None:  # noqa: ANN001
    if node is None:
        return None
    raw = node.get("data-price-incl-vat-cents")
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
    for item in soup.select("div.bm-product"):
        pid = item.get("data-product-nr")
        link = item.select_one("a.bm-product__name")
        price = _price_cents(item.select_one(".bm-product__price"))
        stock_el = item.select_one(".bm-product__stock")
        if not (pid and link and price is not None):
            continue
        in_stock = bool(stock_el and (stock_el.get("data-in-stock") or "").strip() == "1")
        out.append(
            ProductResult(
                store="bouwmaat",
                product_id=str(pid),
                name=link.get_text(strip=True),
                url=urljoin(base_url, link.get("href") or ""),
                price_cents=price,
                in_stock=in_stock,
            )
        )
    return out
