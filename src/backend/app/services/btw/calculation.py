"""BTW (VAT) calculation service.

Aggregates invoice VAT data into Dutch BTW aangifte boxes:
  box_1a: net sales at 21% (hoog tarief)
  box_1b: net sales at 9% (laag tarief)
  box_1c: net sales at 0% (nul/vrijgesteld)
  box_5a: total output VAT due (1a*0.21 + 1b*0.09 + etc.)
  box_5b: total input VAT (voorbelasting) — from journal entries (simplified: 0)
  box_5d: payable = 5a - 5b
"""

from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass
from datetime import date

from app.models.invoice import Invoice, InvoiceLine
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class BtwBoxes:
    box_1a_net_cents: int = 0  # 21% net
    box_1b_net_cents: int = 0  # 9% net
    box_1c_net_cents: int = 0  # 0% net
    box_1d_net_cents: int = 0  # private use (not applicable for construction)
    box_5a_vat_due_cents: int = 0  # total output VAT
    box_5b_voorbelasting_cents: int = 0  # input VAT (simplified)
    box_5d_payable_cents: int = 0  # payable = 5a - 5b


def _quarter_date_range(year: int, quarter: int) -> tuple[date, date]:
    """Return (start_date, end_date) for the given quarter."""
    first_month = (quarter - 1) * 3 + 1
    last_month = first_month + 2
    last_day = calendar.monthrange(year, last_month)[1]
    return date(year, first_month, 1), date(year, last_month, last_day)


async def calculate_btw_boxes(
    owner_id: uuid.UUID,
    year: int,
    quarter: int,
    db: AsyncSession,
) -> BtwBoxes:
    """Calculate BTW boxes from invoices for the given quarter.

    Only non-cancelled, non-deleted invoices are included.
    Lines aggregated by VAT rate bucket.
    """
    start, end = _quarter_date_range(year, quarter)

    # Load all active invoices in the quarter for this owner.
    stmt = select(Invoice).where(
        Invoice.owner_id == owner_id,
        Invoice.issue_date >= start,
        Invoice.issue_date <= end,
        Invoice.deleted_at.is_(None),
        Invoice.status != "cancelled",
    )
    result = await db.execute(stmt)
    invoices = result.scalars().all()

    if not invoices:
        return BtwBoxes()

    invoice_ids = [inv.id for inv in invoices]

    # Load all lines for these invoices.
    lines_stmt = select(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids))
    lines_result = await db.execute(lines_stmt)
    lines = lines_result.scalars().all()

    net_by_rate: dict[int, int] = {}
    for line in lines:
        net_by_rate[line.vat_rate_bp] = net_by_rate.get(line.vat_rate_bp, 0) + line.line_net_cents

    box_1a, box_1b, box_1c = net_by_rate.get(2100, 0), net_by_rate.get(900, 0), net_by_rate.get(0, 0)
    box_5a = sum(net * rate_bp // 10000 for rate_bp, net in net_by_rate.items() if rate_bp > 0)

    # box_5b: input VAT from purchase invoices/journal entries.
    # For now simplified to 0 — a full implementation would query
    # journal lines tagged to BTW-voorheffing accounts.
    box_5b = 0

    box_5d = box_5a - box_5b

    return BtwBoxes(
        box_1a_net_cents=box_1a,
        box_1b_net_cents=box_1b,
        box_1c_net_cents=box_1c,
        box_1d_net_cents=0,
        box_5a_vat_due_cents=box_5a,
        box_5b_voorbelasting_cents=box_5b,
        box_5d_payable_cents=box_5d,
    )
