"""Accounting export router.

POST /api/v1/exports/{format}  — trigger an export and return the file
GET  /api/v1/exports/history   — list past exports for the current user

Supported formats:
  mt940          SWIFT MT940 bank statement (for Exact Online bank reconciliation)
  csv_journal    CSV journal entries export (Exact Online grootboek import)
  csv_invoices   CSV invoice summary export
"""

from __future__ import annotations

import uuid
from datetime import date

from app.core.database import get_db
from app.models.export_history import ExportHistory
from app.models.finance import Account, JournalEntry
from app.models.invoice import Customer, Invoice
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.export import (
    CSVExportRequest,
    ExportHistoryResponse,
    MT940ExportRequest,
)
from app.services.exports.csv_export import CSVInvoiceFormatter, CSVJournalFormatter
from app.services.exports.mt940 import MT940Formatter
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


def _parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date format: {s}")


async def _record_export(
    db: AsyncSession,
    owner_id: uuid.UUID,
    fmt: str,
    date_from: str,
    date_to: str,
    row_count: int,
) -> ExportHistory:
    record = ExportHistory(
        owner_id=owner_id,
        format=fmt,
        date_from=date_from,
        date_to=date_to,
        row_count=row_count,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ---------------------------------------------------------------------------
# POST /api/v1/exports/{format}
# ---------------------------------------------------------------------------


@router.post("/mt940")
async def export_mt940(
    payload: MT940ExportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlainTextResponse:
    """Export journal entries as MT940 bank statement file."""
    date_from = _parse_date(payload.date_from)
    date_to = _parse_date(payload.date_to)

    # Fetch journal entries with lines + account codes in the date range
    result = await db.execute(
        select(JournalEntry)
        .where(
            JournalEntry.owner_id == user.id,
            JournalEntry.entry_date >= date_from,
            JournalEntry.entry_date <= date_to,
            JournalEntry.is_posted.is_(True),
        )
        .options(selectinload(JournalEntry.lines))
        .order_by(JournalEntry.entry_date)
    )
    entries = list(result.scalars().all())

    # Build flat transaction list from cash-type accounts (debit = outflow, credit = inflow)
    transactions = []
    for entry in entries:
        for line in entry.lines:
            if line.credit_cents > 0:
                transactions.append(
                    {
                        "date": entry.entry_date,
                        "amount_cents": line.credit_cents,
                        "is_credit": True,
                        "description": entry.description,
                        "reference": entry.reference or "",
                    }
                )
            elif line.debit_cents > 0:
                transactions.append(
                    {
                        "date": entry.entry_date,
                        "amount_cents": line.debit_cents,
                        "is_credit": False,
                        "description": entry.description,
                        "reference": entry.reference or "",
                    }
                )

    # Running balance
    start_balance_cents = 0
    end_balance_cents = sum(
        t["amount_cents"] if t["is_credit"] else -t["amount_cents"] for t in transactions
    )

    fmt = MT940Formatter(
        account_number=payload.account_number,
        bank_id=payload.bank_id,
    )
    content = fmt.format(
        transactions=transactions,
        start_balance_cents=start_balance_cents,
        end_balance_cents=end_balance_cents,
        statement_date=date_to,
    )

    await _record_export(db, user.id, "mt940", payload.date_from, payload.date_to, len(transactions))

    filename = f"export_{payload.date_from}_{payload.date_to}.sta"
    return PlainTextResponse(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/csv_journal")
async def export_csv_journal(
    payload: CSVExportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export journal entries as Exact Online-compatible CSV."""
    date_from = _parse_date(payload.date_from)
    date_to = _parse_date(payload.date_to)

    # Fetch entries with lines
    entries_result = await db.execute(
        select(JournalEntry)
        .where(
            JournalEntry.owner_id == user.id,
            JournalEntry.entry_date >= date_from,
            JournalEntry.entry_date <= date_to,
            JournalEntry.is_posted.is_(True),
        )
        .options(selectinload(JournalEntry.lines))
        .order_by(JournalEntry.entry_date)
    )
    entries = list(entries_result.scalars().all())

    # Fetch account codes in one query
    all_account_ids = {line.account_id for entry in entries for line in entry.lines}
    account_map: dict[uuid.UUID, Account] = {}
    if all_account_ids:
        acc_result = await db.execute(select(Account).where(Account.id.in_(all_account_ids)))
        for acc in acc_result.scalars().all():
            account_map[acc.id] = acc

    rows = []
    for entry in entries:
        for line in entry.lines:
            acc = account_map.get(line.account_id)
            rows.append(
                {
                    "entry_date": entry.entry_date,
                    "account_code": acc.code if acc else str(line.account_id),
                    "account_name": acc.name if acc else "",
                    "description": entry.description,
                    "reference": entry.reference,
                    "debit_cents": line.debit_cents,
                    "credit_cents": line.credit_cents,
                }
            )

    formatter = CSVJournalFormatter()
    csv_content = formatter.format(rows)

    await _record_export(db, user.id, "csv_journal", payload.date_from, payload.date_to, len(rows))

    filename = f"journaal_{payload.date_from}_{payload.date_to}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/csv_invoices")
async def export_csv_invoices(
    payload: CSVExportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export invoices as CSV summary."""
    date_from = _parse_date(payload.date_from)
    date_to = _parse_date(payload.date_to)

    inv_result = await db.execute(
        select(Invoice, Customer.name.label("customer_name"))
        .join(Customer, Invoice.customer_id == Customer.id)
        .where(
            Invoice.owner_id == user.id,
            Invoice.issue_date >= date_from,
            Invoice.issue_date <= date_to,
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.issue_date)
    )
    rows = []
    for invoice, customer_name in inv_result.all():
        rows.append(
            {
                "invoice_number": invoice.invoice_number,
                "customer_name": customer_name,
                "issue_date": invoice.issue_date,
                "due_date": invoice.due_date,
                "subtotal_cents": invoice.subtotal_cents,
                "vat_total_cents": invoice.vat_total_cents,
                "total_cents": invoice.total_cents,
                "status": invoice.status,
            }
        )

    formatter = CSVInvoiceFormatter()
    csv_content = formatter.format(rows)

    await _record_export(db, user.id, "csv_invoices", payload.date_from, payload.date_to, len(rows))

    filename = f"facturen_{payload.date_from}_{payload.date_to}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# GET /api/v1/exports/history
# ---------------------------------------------------------------------------


@router.get("/history", response_model=list[ExportHistoryResponse])
async def export_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ExportHistory]:
    """Return export history for the current user, newest first."""
    result = await db.execute(
        select(ExportHistory)
        .where(ExportHistory.owner_id == user.id)
        .order_by(ExportHistory.exported_at.desc())
    )
    return list(result.scalars().all())
