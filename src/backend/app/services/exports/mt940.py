"""MT940 bank statement formatter.

Generates SWIFT MT940 structured text output for Dutch bank transactions.
MT940 is the standard format accepted by Exact Online and Twinfield for
bank reconciliation imports.

Reference: SWIFT MT940 field specifications.
"""

from __future__ import annotations

from datetime import date
from typing import TypedDict


class Transaction(TypedDict):
    date: date
    amount_cents: int
    is_credit: bool
    description: str
    reference: str


class MT940Formatter:
    """Formats bank transactions as a SWIFT MT940 statement file."""

    def __init__(self, account_number: str, bank_id: str) -> None:
        self._account_number = account_number
        self._bank_id = bank_id

    def format(
        self,
        transactions: list[Transaction],
        start_balance_cents: int,
        end_balance_cents: int,
        statement_date: date,
    ) -> str:
        """Return a complete MT940 statement as a string."""
        lines: list[str] = []

        # :20: Transaction Reference Number
        lines.append(f":20:{statement_date.strftime('%Y%m%d')}")

        # :25: Account Identification
        lines.append(f":25:{self._account_number}/{self._bank_id}")

        # :28C: Statement Number / Sequence Number
        lines.append(":28C:00001/001")

        # :60F: Opening Balance  (D=debit / C=credit, date, currency, amount)
        sign = "C" if start_balance_cents >= 0 else "D"
        lines.append(
            f":60F:{sign}{statement_date.strftime('%y%m%d')}EUR{self._format_amount(abs(start_balance_cents))}"
        )

        # :61: Statement Line + :86: Information to Account Owner — one per transaction
        for txn in transactions:
            d_or_c = "C" if txn["is_credit"] else "D"
            val_date = txn["date"].strftime("%y%m%d")
            amount_str = self._format_amount(txn["amount_cents"])
            # :61: value-date, booking-date omitted, D/C, amount, swift-code, reference
            ref = (txn["reference"] or "NONREF")[:16]
            lines.append(f":61:{val_date}{d_or_c}{amount_str}NTRFNONREF//{ref}")
            # :86: description (max 390 chars across 6 lines of 65 chars)
            desc = txn["description"][:65]
            lines.append(f":86:{desc}")

        # :62F: Closing Balance
        sign = "C" if end_balance_cents >= 0 else "D"
        lines.append(f":62F:{sign}{statement_date.strftime('%y%m%d')}EUR{self._format_amount(abs(end_balance_cents))}")

        return "\r\n".join(lines) + "\r\n"

    @staticmethod
    def _format_amount(cents: int) -> str:
        """Format integer cents as MT940 amount string: e.g. 12150 → '121,50'."""
        euros = cents // 100
        remainder = cents % 100
        return f"{euros},{remainder:02d}"
