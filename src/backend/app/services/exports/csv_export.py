"""CSV export formatters — Exact Online compatible.

Two formatters:
- CSVJournalFormatter  — journal entries (grootboek) for Exact Online import
- CSVInvoiceFormatter  — invoice summary export

Column names and date formats follow Exact Online's CSV import specification.
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any, ClassVar


def _fmt_date(d: date) -> str:
    """dd-MM-yyyy per Dutch locale."""
    return d.strftime("%d-%m-%Y")


def _fmt_euros(cents: int) -> str:
    return f"{cents / 100:.2f}"


def _write_csv(headers: list[str], rows: list[dict[str, str]]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


class CSVJournalFormatter:
    """Format journal entry lines as Exact Online-compatible CSV."""

    HEADERS: ClassVar[list[str]] = ["Datum", "Grootboekrekening", "Grootboekrekeningnaam", "Omschrijving", "Referentie", "Debet", "Credit"]

    def format(self, rows: list[dict[str, Any]]) -> str:
        return _write_csv(self.HEADERS, [
            {"Datum": _fmt_date(r["entry_date"]), "Grootboekrekening": r["account_code"],
             "Grootboekrekeningnaam": r["account_name"], "Omschrijving": r["description"],
             "Referentie": r.get("reference") or "", "Debet": _fmt_euros(r["debit_cents"]),
             "Credit": _fmt_euros(r["credit_cents"])}
            for r in rows
        ])


class CSVInvoiceFormatter:
    """Format invoices as a Dutch-locale summary CSV."""

    HEADERS: ClassVar[list[str]] = ["Factuurnummer", "Klant", "Factuurdatum", "Vervaldatum", "Subtotaal", "BTW", "Totaal", "Status"]

    def format(self, rows: list[dict[str, Any]]) -> str:
        return _write_csv(self.HEADERS, [
            {"Factuurnummer": r["invoice_number"], "Klant": r["customer_name"],
             "Factuurdatum": _fmt_date(r["issue_date"]), "Vervaldatum": _fmt_date(r["due_date"]),
             "Subtotaal": _fmt_euros(r["subtotal_cents"]), "BTW": _fmt_euros(r["vat_total_cents"]),
             "Totaal": _fmt_euros(r["total_cents"]), "Status": r["status"]}
            for r in rows
        ])
