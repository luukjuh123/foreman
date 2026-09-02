"""Invoice payment reconciliation logic.

Match an incoming Mollie payment (amount + reference) to an outstanding invoice.
On match:
  - update invoice status to 'paid'
  - create a double-entry journal entry (Bank debit, Accounts Receivable credit)

Account codes used (Dutch RGS-light — seeded by /api/v1/financials/accounts/seed):
  1020  Bank zakelijk  (asset, debit normal)
  1300  Debiteuren     (asset, debit normal)

Journal entry on payment receipt:
  DR  1020  Bank zakelijk     amount_cents  (cash in)
  CR  1300  Debiteuren        amount_cents  (clear receivable)
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime

from app.models.finance import Account, JournalEntry, JournalLine
from app.models.invoice import Invoice
from app.models.payment_reconciliation import UnmatchedPayment
from app.services.invoices.status import apply_transition
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# Statuses that are eligible for payment reconciliation.
_RECONCILABLE_STATUSES = frozenset({"sent", "overdue"})

# RGS account codes used for the journal entry.
_BANK_CODE = "1020"  # Bank zakelijk
_AR_CODE = "1300"  # Debiteuren


def find_matching_invoice(
    invoices: Sequence[Invoice],
    *,
    amount_cents: int,
    reference: str | None,
) -> Invoice | None:
    """Return the first reconcilable invoice that matches amount + reference.

    Matching rules (in order):
    1. Status must be in {sent, overdue} — paid/cancelled are skipped.
    2. total_cents must equal amount_cents.
    3. If reference is non-empty: invoice_number must equal reference (case-insensitive strip).
       If reference is empty/None: amount match alone is sufficient (first match wins).
    """
    ref = reference.strip() if reference else None

    for inv in invoices:
        if inv.status not in _RECONCILABLE_STATUSES:
            continue
        if inv.total_cents != amount_cents:
            continue
        if ref and inv.invoice_number.strip().lower() != ref.lower():
            continue
        return inv
    return None


async def reconcile_payment(
    db: AsyncSession,
    *,
    mollie_payment_id: str,
    amount_cents: int,
    reference: str | None,
    raw_payload: str | None = None,
    now: datetime | None = None,
) -> tuple[bool, Invoice | None]:
    """Attempt to reconcile a Mollie payment against outstanding invoices.

    Returns (matched, invoice_or_none).

    Side effects on match:
    - Invoice status set to 'paid', paid_at set.
    - JournalEntry created (debit Bank, credit AR) if seeded accounts exist.

    Side effects on no-match:
    - UnmatchedPayment record upserted (idempotent on mollie_payment_id).
    """
    moment = now or datetime.now(UTC)

    # --- Idempotency check: if this payment was already matched, skip. ---
    # Check if the invoice was already paid via this payment by looking for
    # an existing JournalEntry with reference = mollie_payment_id.
    existing_je = (
        await db.execute(select(JournalEntry).where(JournalEntry.reference == mollie_payment_id))
    ).scalar_one_or_none()
    if existing_je is not None:
        # Already processed — find the invoice and return it.
        # We don't know which invoice it was; return matched=True, invoice=None.
        return True, None

    # --- Load all reconcilable invoices. ---
    result = await db.execute(
        select(Invoice)
        .where(
            Invoice.status.in_(list(_RECONCILABLE_STATUSES)),
            Invoice.deleted_at.is_(None),
        )
        .options(selectinload(Invoice.lines))
    )
    invoices = result.scalars().all()

    match = find_matching_invoice(invoices, amount_cents=amount_cents, reference=reference)

    if match is None:
        # Store as unmatched — upsert on mollie_payment_id (idempotent).
        existing_unmatched = (
            await db.execute(select(UnmatchedPayment).where(UnmatchedPayment.mollie_payment_id == mollie_payment_id))
        ).scalar_one_or_none()
        if existing_unmatched is None:
            db.add(
                UnmatchedPayment(
                    mollie_payment_id=mollie_payment_id,
                    amount_cents=amount_cents,
                    reference=reference,
                    raw_payload=raw_payload,
                )
            )
        await db.commit()
        return False, None

    # --- Match found — mark invoice paid. ---
    apply_transition(match, "paid", now=moment)

    # --- Create journal entry (if RGS accounts are seeded). ---
    bank_account = (
        await db.execute(
            select(Account).where(
                Account.owner_id == match.owner_id,
                Account.code == _BANK_CODE,
                Account.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    ar_account = (
        await db.execute(
            select(Account).where(
                Account.owner_id == match.owner_id,
                Account.code == _AR_CODE,
                Account.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if bank_account is not None and ar_account is not None:
        entry = JournalEntry(
            owner_id=match.owner_id,
            entry_date=moment.date() if hasattr(moment, "date") else date.today(),
            description=f"Betaling ontvangen voor factuur {match.invoice_number}",
            reference=match.invoice_number,
            is_posted=True,
        )
        entry.lines = [
            JournalLine(
                account_id=bank_account.id,
                debit_cents=amount_cents,
                credit_cents=0,
                description=f"Mollie betaling {mollie_payment_id}",
            ),
            JournalLine(
                account_id=ar_account.id,
                debit_cents=0,
                credit_cents=amount_cents,
                description=f"Factuur {match.invoice_number} voldaan",
            ),
        ]
        db.add(entry)

    await db.commit()
    return True, match
