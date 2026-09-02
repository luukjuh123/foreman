"""Money-safe VAT and quote total calculations.

All values in/out are integer euro cents.
VAT rates are integer basis points (e.g. 2100 = 21%).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from decimal import ROUND_HALF_UP, Decimal

from app.models.quote import ALLOWED_VAT_RATES_BP

_BP_DENOM = Decimal(10_000)


def _check_rate(vat_rate_bp: int) -> None:
    if vat_rate_bp not in ALLOWED_VAT_RATES_BP:
        msg = f"Unsupported VAT rate {vat_rate_bp} bp; allowed: {ALLOWED_VAT_RATES_BP}"
        raise ValueError(msg)


def compute_line_totals(*, quantity: float, unit_price_cents: int, vat_rate_bp: int) -> tuple[int, int]:
    """Return (net_cents, vat_cents) for a single line, using ROUND_HALF_UP."""
    _check_rate(vat_rate_bp)

    qty = Decimal(str(quantity))
    unit_price = Decimal(unit_price_cents)
    net = (qty * unit_price).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    vat = (net * Decimal(vat_rate_bp) / _BP_DENOM).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(net), int(vat)


def compute_vat_breakdown(lines: Iterable[Mapping[str, object]]) -> dict[int, int]:
    """Return a dict of {vat_rate_bp: vat_cents} for all line items."""
    breakdown: dict[int, int] = {}
    for line in lines:
        rate = int(line["vat_rate_bp"])  # type: ignore[arg-type]
        _, vat = compute_line_totals(
            quantity=float(line["quantity"]),  # type: ignore[arg-type]
            unit_price_cents=int(line["unit_price_cents"]),  # type: ignore[arg-type]
            vat_rate_bp=rate,
        )
        breakdown[rate] = breakdown.get(rate, 0) + vat
    return breakdown
