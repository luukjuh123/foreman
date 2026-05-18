"""Financials router — chart of accounts (Dutch RGS-light boekhoudschema)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.finance import Account
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.finance import (
    AccountCreate,
    AccountResponse,
    AccountTreeNode,
    AccountUpdate,
)
from app.services.finance.seed import DUTCH_RGS_LIGHT

router = APIRouter()


@router.post(
    "/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED
)
async def create_account(
    payload: AccountCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Account:
    existing = await db.execute(
        select(Account).where(Account.owner_id == user.id, Account.code == payload.code)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Account code {payload.code} already exists",
        )
    if payload.parent_id is not None:
        parent = await db.get(Account, payload.parent_id)
        if parent is None or parent.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Parent account not found")
    account = Account(
        owner_id=user.id,
        code=payload.code,
        name=payload.name,
        account_type=payload.account_type,
        normal_balance=payload.normal_balance,
        parent_id=payload.parent_id,
        cashflow_category=payload.cashflow_category,
        description=payload.description,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Account]:
    result = await db.execute(
        select(Account).where(Account.owner_id == user.id).order_by(Account.code)
    )
    return list(result.scalars().all())


@router.get("/accounts/tree", response_model=list[AccountTreeNode])
async def account_tree(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(Account).where(Account.owner_id == user.id).order_by(Account.code)
    )
    accounts = list(result.scalars().all())
    nodes: dict[uuid.UUID, dict[str, Any]] = {
        a.id: {
            "id": a.id,
            "code": a.code,
            "name": a.name,
            "account_type": a.account_type,
            "normal_balance": a.normal_balance,
            "cashflow_category": a.cashflow_category,
            "is_active": a.is_active,
            "children": [],
        }
        for a in accounts
    }
    roots: list[dict[str, Any]] = []
    for a in accounts:
        node = nodes[a.id]
        if a.parent_id is not None and a.parent_id in nodes:
            nodes[a.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Account:
    account = await db.get(Account, account_id)
    if account is None or account.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: uuid.UUID,
    payload: AccountUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Account:
    account = await db.get(Account, account_id)
    if account is None or account.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await db.commit()
    await db.refresh(account)
    return account


@router.post("/accounts/seed", response_model=list[AccountResponse], status_code=201)
async def seed_dutch_rgs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Account]:
    """Seed the Dutch RGS-light chart of accounts. Idempotent per owner."""
    existing_result = await db.execute(
        select(Account.code).where(Account.owner_id == user.id)
    )
    existing_codes = {c for (c,) in existing_result.all()}

    by_code: dict[str, Account] = {}
    for seed in DUTCH_RGS_LIGHT:
        if seed.code in existing_codes:
            continue
        acc = Account(
            owner_id=user.id,
            code=seed.code,
            name=seed.name,
            account_type=seed.account_type,
            normal_balance=seed.normal_balance,
            cashflow_category=seed.cashflow_category,
        )
        db.add(acc)
        by_code[seed.code] = acc
    await db.flush()

    for seed in DUTCH_RGS_LIGHT:
        if seed.parent_code is None:
            continue
        child = by_code.get(seed.code)
        parent = by_code.get(seed.parent_code)
        if child is None or parent is None:
            continue
        child.parent_id = parent.id
    await db.commit()

    result = await db.execute(
        select(Account).where(Account.owner_id == user.id).order_by(Account.code)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Journal entries — double-entry bookkeeping
# ---------------------------------------------------------------------------

from datetime import datetime as _dt  # noqa: E402

from app.models.finance import (  # noqa: E402
    JournalEntry,
    JournalLine,
    Period,
)
from app.schemas.finance import (  # noqa: E402
    JournalEntryCreate,
    JournalEntryResponse,
)
from sqlalchemy.orm import selectinload  # noqa: E402


async def _entry_date_in_locked_period(
    db: AsyncSession, owner_id: uuid.UUID, entry_date
) -> bool:
    result = await db.execute(
        select(Period).where(
            Period.owner_id == owner_id,
            Period.is_locked.is_(True),
            Period.start_date <= entry_date,
            Period.end_date >= entry_date,
        )
    )
    return result.first() is not None


@router.post(
    "/journal-entries",
    response_model=JournalEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_journal_entry(
    payload: JournalEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntry:
    """Create a balanced double-entry journal entry.

    Pydantic validates debits == credits and one-side-per-line. Here we
    enforce account ownership and locked-period rejection.
    """
    # Verify every account belongs to this user
    account_ids = {line.account_id for line in payload.lines}
    acc_result = await db.execute(
        select(Account).where(
            Account.id.in_(account_ids), Account.owner_id == user.id
        )
    )
    found = {a.id for a in acc_result.scalars().all()}
    missing = account_ids - found
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown or unauthorized account(s): {sorted(str(m) for m in missing)}",
        )

    if await _entry_date_in_locked_period(db, user.id, payload.entry_date):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot create entry: date falls in a locked period",
        )

    entry = JournalEntry(
        owner_id=user.id,
        entry_date=payload.entry_date,
        description=payload.description,
        reference=payload.reference,
        is_posted=True,
    )
    for line in payload.lines:
        entry.lines.append(
            JournalLine(
                account_id=line.account_id,
                debit_cents=line.debit_cents,
                credit_cents=line.credit_cents,
                description=line.description,
            )
        )
    db.add(entry)
    await db.commit()
    # Re-fetch with eager lines
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.id == entry.id)
        .options(selectinload(JournalEntry.lines))
    )
    return result.scalar_one()


@router.get("/journal-entries", response_model=list[JournalEntryResponse])
async def list_journal_entries(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[JournalEntry]:
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.owner_id == user.id)
        .options(selectinload(JournalEntry.lines))
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryResponse)
async def get_journal_entry(
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntry:
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.id == entry_id)
        .options(selectinload(JournalEntry.lines))
    )
    entry = result.scalar_one_or_none()
    if entry is None or entry.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


# ---------------------------------------------------------------------------
# Balance sheet (balans)
# ---------------------------------------------------------------------------

from datetime import date as _date  # noqa: E402

from fastapi import Query as _Query  # noqa: E402

from app.services.finance.reports import (  # noqa: E402
    aggregate_balances,
    build_balance_sheet,
    compute_net_income_cents,
)


@router.get("/reports/balance-sheet")
async def balance_sheet(
    as_of: _date = _Query(..., description="Reporting date (inclusive)"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Balans op een datum: activa = passiva + eigen vermogen + ingehouden winst."""
    aggregates = await aggregate_balances(db, user.id, end_date=as_of)
    net_income = compute_net_income_cents(aggregates)
    sheet = build_balance_sheet(
        aggregates, as_of=as_of, net_income_to_date_cents=net_income
    )
    return sheet.to_dict()
