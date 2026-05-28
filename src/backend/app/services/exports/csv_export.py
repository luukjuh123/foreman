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
from typing import Any


class CSVJournalFormatter:
    """Format journal entry lines as Exact Online-compatible CSV."""

    HEADERS = [
        "Datum",
        "Grootboekrekening",
        "Grootboekrekeningnaam",
        "Omschrijving",
        "Referentie",
        "Debet",
        "Credit",
    ]

    def format(self, rows: list[dict[str, Any]]) -> str:
        """Return CSV string with Exact Online headers.

        Each row dict must have:
            entry_date: date
            account_code: str
            account_name: str
            description: str
            reference: str | None
            debit_cents: int
            credit_cents: int
        """
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=self.HEADERS, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "Datum": self._fmt_date(row["entry_date"]),
                    "Grootboekrekening": row["account_code"],
                    "Grootboekrekeningnaam": row["account_name"],
                    "Omschrijving": row["description"],
                    "Referentie": row.get("reference") or "",
                    "Debet": self._fmt_euros(row["debit_cents"]),
                    "Credit": self._fmt_euros(row["credit_cents"]),
                }
            )
        return buf.getvalue()

    @staticmethod
    def _fmt_date(d: date) -> str:
        """dd-MM-yyyy per Dutch locale."""
        return d.strftime("%d-%m-%Y")

    @staticmethod
    def _fmt_euros(cents: int) -> str:
        return f"{cents / 100:.2f}"


class CSVInvoiceFormatter:
    """Format invoices as a Dutch-locale summary CSV."""

    HEADERS = [
        "Factuurnummer",
        "Klant",
        "Factuurdatum",
        "Vervaldatum",
        "Subtotaal",
        "BTW",
        "Totaal",
        "Status",
    ]

    def format(self, rows: list[dict[str, Any]]) -> str:
        """Return CSV string.

        Each row dict must have:
            invoice_number: str
            customer_name: str
            issue_date: date
            due_date: date
            subtotal_cents: int
            vat_total_cents: int
            total_cents: int
            status: str
        """
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=self.HEADERS, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "Factuurnummer": row["invoice_number"],
                    "Klant": row["customer_name"],
                    "Factuurdatum": self._fmt_date(row["issue_date"]),
                    "Vervaldatum": self._fmt_date(row["due_date"]),
                    "Subtotaal": self._fmt_euros(row["subtotal_cents"]),
                    "BTW": self._fmt_euros(row["vat_total_cents"]),
                    "Totaal": self._fmt_euros(row["total_cents"]),
                    "Status": row["status"],
                }
            )
        return buf.getvalue()

    @staticmethod
    def _fmt_date(d: date) -> str:
        return d.strftime("%d-%m-%Y")

    @staticmethod
    def _fmt_euros(cents: int) -> str:
        return f"{cents / 100:.2f}"
