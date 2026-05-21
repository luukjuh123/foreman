"""Branded PDF invoice generation via WeasyPrint.

The HTML template is rendered without any third-party templating engine —
just standard library string interpolation and HTML escaping. WeasyPrint
is loaded lazily so the rest of the backend can import this module even
when WeasyPrint's native dependencies are unavailable in CI.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from decimal import Decimal
from html import escape
from typing import Any


def _euro(cents: int) -> str:
    return f"{Decimal(int(cents)) / 100:.2f}"


def _percent(bp: int) -> str:
    pct = Decimal(int(bp)) / 100
    if pct == pct.to_integral_value():
        return f"{int(pct)}%"
    return f"{pct:.2f}%"


def _qty(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:g}"


_BASE_STYLE = """
@page { size: A4; margin: 20mm; }
body { font-family: 'Helvetica', sans-serif; color: #111; font-size: 11pt; }
.header { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 20px; }
.brand h1 { margin: 0; font-size: 22pt; }
.brand .meta { font-size: 9pt; color: #555; }
.parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
.parties .box { width: 48%; }
.parties h3 { margin: 0 0 4px 0; font-size: 10pt; text-transform: uppercase;
              color: #555; }
.info-table { width: 100%; margin-bottom: 20px; }
.info-table td { padding: 2px 8px; }
table.lines { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
table.lines th, table.lines td { padding: 6px 8px; border-bottom: 1px solid #ddd;
                                   text-align: left; }
table.lines th { background: #f5f5f5; font-size: 10pt; }
table.lines td.num, table.lines th.num { text-align: right; }
.totals { width: 40%; margin-left: auto; }
.totals td { padding: 4px 8px; }
.totals tr.grand td { font-weight: bold; border-top: 2px solid #111; font-size: 12pt; }
.vat-summary { width: 60%; margin-top: 20px; font-size: 9pt; }
.vat-summary th, .vat-summary td { padding: 4px 8px; border-bottom: 1px solid #eee;
                                    text-align: left; }
.footer { margin-top: 40px; font-size: 9pt; color: #555; border-top: 1px solid #ddd;
          padding-top: 10px; }
.notes { margin: 20px 0; font-style: italic; }
"""


def _supplier_html(supplier: Mapping[str, Any]) -> str:
    parts = [
        f"<strong>{escape(supplier.get('name', ''))}</strong>",
        escape(supplier.get("address_line1", "")),
        f"{escape(supplier.get('postal_code', ''))} {escape(supplier.get('city', ''))}",
        escape(supplier.get("country_code", "NL")),
    ]
    return "<br>".join(p for p in parts if p)


def _customer_html(customer: Mapping[str, Any]) -> str:
    parts = [
        f"<strong>{escape(customer.get('name', ''))}</strong>",
        escape(customer.get("address_line1", "")),
        f"{escape(customer.get('postal_code', ''))} {escape(customer.get('city', ''))}",
        escape(customer.get("country_code", "NL")),
    ]
    return "<br>".join(p for p in parts if p)


def render_invoice_html(
    invoice: Mapping[str, Any],
    *,
    customer: Mapping[str, Any],
    supplier: Mapping[str, Any],
) -> str:
    """Render the invoice as a branded HTML document (no PDF dependency)."""

    currency = invoice.get("currency", "EUR")
    issue: date = invoice["issue_date"]
    due: date = invoice["due_date"]

    line_rows = []
    vat_groups: dict[int, dict[str, int]] = {}
    for idx, ln in enumerate(invoice["lines"], start=1):
        rate_bp = int(ln["vat_rate_bp"])
        g = vat_groups.setdefault(rate_bp, {"net": 0, "vat": 0})
        g["net"] += int(ln["line_net_cents"])
        g["vat"] += int(ln["line_vat_cents"])
        line_rows.append(
            "<tr>"
            f"<td>{idx}</td>"
            f"<td>{escape(str(ln['description']))}</td>"
            f"<td class='num'>{_qty(float(ln['quantity']))} {escape(str(ln.get('unit', '')))}</td>"
            f"<td class='num'>{currency} {_euro(int(ln['unit_price_cents']))}</td>"
            f"<td class='num'>{_percent(rate_bp)}</td>"
            f"<td class='num'>{currency} {_euro(int(ln['line_net_cents']))}</td>"
            "</tr>"
        )

    vat_rows = "".join(
        f"<tr><td>BTW {_percent(rate)}</td>"
        f"<td class='num'>{currency} {_euro(g['net'])}</td>"
        f"<td class='num'>{currency} {_euro(g['vat'])}</td></tr>"
        for rate, g in sorted(vat_groups.items())
    )

    notes_block = f"<div class='notes'>{escape(str(invoice['notes']))}</div>" if invoice.get("notes") else ""

    return f"""<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Factuur {escape(str(invoice["invoice_number"]))}</title>
<style>{_BASE_STYLE}</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>{escape(str(supplier.get("name", "")))}</h1>
      <div class="meta">
        KVK: {escape(str(supplier.get("kvk_number", "")))}<br>
        BTW: {escape(str(supplier.get("vat_number", "")))}<br>
        IBAN: {escape(str(supplier.get("iban", "")))}
      </div>
    </div>
    <div>
      <h2 style="margin:0;">FACTUUR</h2>
      <table class="info-table">
        <tr><td>Nummer:</td><td>{escape(str(invoice["invoice_number"]))}</td></tr>
        <tr><td>Datum:</td><td>{issue.isoformat()}</td></tr>
        <tr><td>Vervaldatum:</td><td>{due.isoformat()}</td></tr>
      </table>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <h3>Afzender</h3>
      {_supplier_html(supplier)}
    </div>
    <div class="box">
      <h3>Geadresseerde</h3>
      {_customer_html(customer)}
      <br>BTW: {escape(str(customer.get("vat_number", "")))}
    </div>
  </div>

  {notes_block}

  <table class="lines">
    <thead>
      <tr>
        <th>#</th>
        <th>Omschrijving</th>
        <th class="num">Aantal</th>
        <th class="num">Stuksprijs</th>
        <th class="num">BTW</th>
        <th class="num">Bedrag</th>
      </tr>
    </thead>
    <tbody>
      {"".join(line_rows)}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotaal</td>
        <td class="num">{currency} {_euro(int(invoice["subtotal_cents"]))}</td></tr>
    <tr><td>BTW</td>
        <td class="num">{currency} {_euro(int(invoice["vat_total_cents"]))}</td></tr>
    <tr class="grand"><td>Totaal</td>
        <td class="num">{currency} {_euro(int(invoice["total_cents"]))}</td></tr>
  </table>

  <table class="vat-summary">
    <thead><tr><th>BTW-tarief</th><th>Grondslag</th><th>BTW</th></tr></thead>
    <tbody>{vat_rows}</tbody>
  </table>

  <div class="footer">
    Betaling binnen {int(invoice.get("payment_terms_days", 30))} dagen
    op rekening {escape(str(supplier.get("iban", "")))} t.n.v.
    {escape(str(supplier.get("name", "")))}, o.v.v. factuurnummer
    {escape(str(invoice["invoice_number"]))}.
  </div>
</body>
</html>"""


def _load_weasyprint_html():  # pragma: no cover - exercised via monkeypatch in tests
    """Lazy import of WeasyPrint's HTML class.

    Isolated so tests can patch the import without paying the WeasyPrint
    native-dependency cost. Raises ImportError if WeasyPrint is unavailable.
    """
    from weasyprint import HTML  # type: ignore[import-not-found]

    return HTML


def render_invoice_pdf(
    invoice: Mapping[str, Any],
    *,
    customer: Mapping[str, Any],
    supplier: Mapping[str, Any],
) -> bytes:
    """Render the invoice as a PDF document using WeasyPrint."""

    html = render_invoice_html(invoice, customer=customer, supplier=supplier)
    try:
        HTML = _load_weasyprint_html()
    except ImportError as exc:
        msg = (
            "WeasyPrint is required to render invoice PDFs but could not be "
            "imported. Install the weasyprint package and its native "
            f"dependencies. Underlying error: {exc}"
        )
        raise RuntimeError(msg) from exc
    return HTML(string=html).write_pdf()
