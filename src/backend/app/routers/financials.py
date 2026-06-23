from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import UTC, timedelta
from datetime import date as _date
from datetime import datetime as _datetime
from typing import Any

from app.core.database import get_db
from app.models.finance import Account, JournalEntry, JournalLine, Period
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.deps import apply_updates, get_or_404
from app.schemas.budget import (
    BudgetItemCreate,
    BudgetItemResponse,
    BudgetItemUpdate,
    BudgetResponse,
    BudgetUpsert,
)
from app.schemas.cost import (
    CostBreakdownResponse,
    LaborCostResponse,
    MaterialCostResponse,
    MaterialLineResponse,
    TaskLaborResponse,
    TotalCostResponse,
)
from app.schemas.finance import (
    AccountCreate,
    AccountResponse,
    AccountTreeNode,
    AccountUpdate,
    JournalEntryCreate,
    JournalEntryResponse,
    PeriodCreate,
    PeriodResponse,
)
from app.services.finance.reports import (
    aggregate_balances,
    build_balance_sheet,
    build_cash_flow_statement,
    build_income_statement,
    compute_net_income_cents,
)
from app.services.finance.seed import DUTCH_RGS_LIGHT
from app.services.financials.labor_cost import (
    DEFAULT_HOURLY_RATE_CENTS,
    LaborCostEstimator,
)
from app.services.financials.material_cost import (
    DefaultStorePriceProvider,
    MaterialCostAggregator,
    StorePriceProvider,
)
from app.services.financials.total_cost import TotalCostCalculator
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import Query as _Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


def get_price_provider() -> StorePriceProvider:
    return DefaultStorePriceProvider()


async def _owned_or_404(db: AsyncSession, model: type, obj_id: uuid.UUID, user: User, label: str = "Resource"):
    obj = await db.get(model, obj_id)
    if obj is None or obj.owner_id != user.id:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return obj


async def _project_for_user_or_404(project_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    from app.models.project import Project
    project = await get_or_404(db, Project, Project.id == project_id, Project.deleted_at.is_(None))
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not your project")


async def _entry_date_in_locked_period(db: AsyncSession, owner_id: uuid.UUID, entry_date: _date) -> bool:
    result = await db.execute(
        select(Period).where(
            Period.owner_id == owner_id, Period.is_locked.is_(True),
            Period.start_date <= entry_date, Period.end_date >= entry_date,
        )
    )
    return result.first() is not None


def _validate_date_range(start_date: _date, end_date: _date) -> None:
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")


async def _commit_and_refresh(db: AsyncSession, obj: Any) -> Any:
    await db.commit()
    await db.refresh(obj)
    return obj


async def _budget_with_items(db: AsyncSession, budget_id: uuid.UUID) -> Any:
    from app.models.material import Budget
    return (await db.execute(select(Budget).where(Budget.id == budget_id).options(selectinload(Budget.items)))).scalar_one()


def _budget_response(budget: Any) -> BudgetResponse:
    return BudgetResponse(
        id=budget.id, project_id=budget.project_id,
        total_budget_cents=budget.total_budget_cents, contingency_pct=budget.contingency_pct,
        created_at=budget.created_at, updated_at=budget.updated_at,
        items=[BudgetItemResponse.model_validate(i) for i in budget.items],
    )


async def _get_budget_item_or_404(db: AsyncSession, project_id: uuid.UUID, item_id: uuid.UUID) -> Any:
    from app.models.material import Budget, BudgetItem
    item = (await db.execute(
        select(BudgetItem).join(Budget, BudgetItem.budget_id == Budget.id)
        .where(BudgetItem.id == item_id, Budget.project_id == project_id)
    )).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Budget item not found")
    return item


async def _get_or_create_budget(project_id: uuid.UUID, db: AsyncSession) -> Any:
    from app.models.material import Budget
    budget = (await db.execute(select(Budget).where(Budget.project_id == project_id))).scalar_one_or_none()
    if budget is None:
        budget = Budget(project_id=project_id)
        db.add(budget)
        await db.flush()
    return budget


@router.post("/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Account:
    if (await db.execute(select(Account).where(Account.owner_id == user.id, Account.code == payload.code))).scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Account code {payload.code} already exists")
    if payload.parent_id is not None:
        await _owned_or_404(db, Account, payload.parent_id, user, "Parent account")
    account = Account(owner_id=user.id, **payload.model_dump())
    db.add(account)
    return await _commit_and_refresh(db, account)


@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Account]:
    return list((await db.execute(select(Account).where(Account.owner_id == user.id).order_by(Account.code))).scalars().all())


@router.get("/accounts/tree", response_model=list[AccountTreeNode])
async def account_tree(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    accounts = list((await db.execute(select(Account).where(Account.owner_id == user.id).order_by(Account.code))).scalars().all())
    nodes: dict[uuid.UUID, dict[str, Any]] = {
        a.id: {
            "id": a.id, "code": a.code, "name": a.name, "account_type": a.account_type,
            "normal_balance": a.normal_balance, "cashflow_category": a.cashflow_category,
            "is_active": a.is_active, "children": [],
        }
        for a in accounts
    }
    roots: list[dict[str, Any]] = []
    for a in accounts:
        (nodes[a.parent_id]["children"] if (a.parent_id and a.parent_id in nodes) else roots).append(nodes[a.id])
    return roots


@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Account:
    return await _owned_or_404(db, Account, account_id, user, "Account")


@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: uuid.UUID,
    payload: AccountUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Account:
    account = await _owned_or_404(db, Account, account_id, user, "Account")
    apply_updates(account, payload)
    return await _commit_and_refresh(db, account)


@router.post("/accounts/seed", response_model=list[AccountResponse], status_code=201)
async def seed_dutch_rgs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Account]:
    existing_codes = {c for (c,) in (await db.execute(select(Account.code).where(Account.owner_id == user.id))).all()}
    by_code: dict[str, Account] = {}
    for seed in DUTCH_RGS_LIGHT:
        if seed.code in existing_codes:
            continue
        acc = Account(
            owner_id=user.id, code=seed.code, name=seed.name,
            account_type=seed.account_type, normal_balance=seed.normal_balance,
            cashflow_category=seed.cashflow_category,
        )
        db.add(acc)
        by_code[seed.code] = acc
    await db.flush()
    for seed in DUTCH_RGS_LIGHT:
        if seed.parent_code and seed.code in by_code and seed.parent_code in by_code:
            by_code[seed.code].parent_id = by_code[seed.parent_code].id
    await db.commit()
    return list((await db.execute(select(Account).where(Account.owner_id == user.id).order_by(Account.code))).scalars().all())


@router.post("/journal-entries", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_journal_entry(
    payload: JournalEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntry:
    account_ids = {line.account_id for line in payload.lines}
    found = {a.id for a in (await db.execute(select(Account).where(Account.id.in_(account_ids), Account.owner_id == user.id))).scalars().all()}
    if missing := account_ids - found:
        raise HTTPException(status_code=400, detail=f"Unknown or unauthorized account(s): {sorted(str(m) for m in missing)}")
    if await _entry_date_in_locked_period(db, user.id, payload.entry_date):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot create entry: date falls in a locked period")
    entry = JournalEntry(owner_id=user.id, entry_date=payload.entry_date, description=payload.description, reference=payload.reference, is_posted=True)
    for line in payload.lines:
        entry.lines.append(JournalLine(account_id=line.account_id, debit_cents=line.debit_cents, credit_cents=line.credit_cents, description=line.description))
    db.add(entry)
    await db.commit()
    return (await db.execute(select(JournalEntry).where(JournalEntry.id == entry.id).options(selectinload(JournalEntry.lines)))).scalar_one()


@router.get("/journal-entries", response_model=list[JournalEntryResponse])
async def list_journal_entries(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[JournalEntry]:
    return list((await db.execute(
        select(JournalEntry).where(JournalEntry.owner_id == user.id)
        .options(selectinload(JournalEntry.lines))
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc())
    )).scalars().all())


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryResponse)
async def get_journal_entry(
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalEntry:
    entry = (await db.execute(select(JournalEntry).where(JournalEntry.id == entry_id).options(selectinload(JournalEntry.lines)))).scalar_one_or_none()
    if entry is None or entry.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@router.get("/reports/balance-sheet")
async def balance_sheet(
    as_of: _date = _Query(..., description="Reporting date (inclusive)"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    agg = await aggregate_balances(db, user.id, end_date=as_of)
    return build_balance_sheet(agg, as_of=as_of, net_income_to_date_cents=compute_net_income_cents(agg)).to_dict()


@router.get("/reports/income-statement")
async def income_statement(
    start_date: _date = _Query(..., description="Period start (inclusive)"),
    end_date: _date = _Query(..., description="Period end (inclusive)"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _validate_date_range(start_date, end_date)
    return build_income_statement(
        await aggregate_balances(db, user.id, start_date=start_date, end_date=end_date),
        start_date=start_date, end_date=end_date,
    ).to_dict()


@router.get("/reports/cash-flow")
async def cash_flow_statement(
    start_date: _date = _Query(..., description="Period start (inclusive)"),
    end_date: _date = _Query(..., description="Period end (inclusive)"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _validate_date_range(start_date, end_date)
    opening = await aggregate_balances(db, user.id, end_date=start_date - timedelta(days=1))
    closing = await aggregate_balances(db, user.id, end_date=end_date)
    return build_cash_flow_statement(
        opening_aggregates=opening, closing_aggregates=closing,
        period_aggregates=await aggregate_balances(db, user.id, start_date=start_date, end_date=end_date),
        start_date=start_date, end_date=end_date,
    ).to_dict()


@router.post("/periods", response_model=PeriodResponse, status_code=status.HTTP_201_CREATED)
async def create_period(
    payload: PeriodCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Period:
    period = Period(owner_id=user.id, name=payload.name, start_date=payload.start_date, end_date=payload.end_date)
    db.add(period)
    return await _commit_and_refresh(db, period)


@router.get("/periods", response_model=list[PeriodResponse])
async def list_periods(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Period]:
    return list((await db.execute(select(Period).where(Period.owner_id == user.id).order_by(Period.start_date.desc()))).scalars().all())


@router.post("/periods/{period_id}/lock", response_model=PeriodResponse)
async def lock_period(
    period_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Period:
    period = await _owned_or_404(db, Period, period_id, user, "Period")
    if period.is_locked:
        raise HTTPException(status_code=409, detail="Period already locked")
    period.is_locked = True
    period.locked_at = _datetime.now(UTC)
    return await _commit_and_refresh(db, period)


@router.post("/periods/{period_id}/unlock", response_model=PeriodResponse)
async def unlock_period(
    period_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Period:
    period = await _owned_or_404(db, Period, period_id, user, "Period")
    period.is_locked = False
    period.locked_at = None
    return await _commit_and_refresh(db, period)


@router.get("/periods/{period_id}/year-end-report")
async def year_end_report(
    period_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    period = await _owned_or_404(db, Period, period_id, user, "Period")
    period_agg = await aggregate_balances(db, user.id, start_date=period.start_date, end_date=period.end_date)
    closing = await aggregate_balances(db, user.id, end_date=period.end_date)
    opening = await aggregate_balances(db, user.id, end_date=period.start_date - timedelta(days=1))
    return {
        "period": {
            "id": str(period.id), "name": period.name,
            "start_date": period.start_date.isoformat(), "end_date": period.end_date.isoformat(),
            "is_locked": period.is_locked, "locked_at": period.locked_at.isoformat() if period.locked_at else None,
        },
        "balance_sheet": build_balance_sheet(closing, as_of=period.end_date, net_income_to_date_cents=compute_net_income_cents(closing)).to_dict(),
        "income_statement": build_income_statement(period_agg, start_date=period.start_date, end_date=period.end_date).to_dict(),
        "cash_flow_statement": build_cash_flow_statement(
            opening_aggregates=opening, closing_aggregates=closing,
            period_aggregates=period_agg, start_date=period.start_date, end_date=period.end_date,
        ).to_dict(),
    }


@router.get("/projects/{project_id}/labor-cost", response_model=LaborCostResponse)
async def get_labor_cost(
    project_id: uuid.UUID,
    hourly_rate_cents: int = _Query(default=DEFAULT_HOURLY_RATE_CENTS, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LaborCostResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    report = await LaborCostEstimator(hourly_rate_cents=hourly_rate_cents).estimate(project_id, db)
    return LaborCostResponse(
        hourly_rate_cents=report.hourly_rate_cents, total_hours=report.total_hours, total_cents=report.total_cents,
        tasks=[TaskLaborResponse(**asdict(t)) for t in report.tasks],
    )


@router.get("/projects/{project_id}/total-cost", response_model=TotalCostResponse)
async def get_total_cost(
    project_id: uuid.UUID,
    hourly_rate_cents: int = _Query(default=DEFAULT_HOURLY_RATE_CENTS, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    provider: StorePriceProvider = Depends(get_price_provider),
) -> TotalCostResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    report = await TotalCostCalculator(price_provider=provider, hourly_rate_cents=hourly_rate_cents).calculate(project_id, db)
    return TotalCostResponse(
        total_cents=report.total_cents, hourly_rate_cents=report.hourly_rate_cents,
        breakdown=CostBreakdownResponse(**asdict(report.breakdown)),
        materials_missing_count=report.materials_missing_count,
    )


@router.get("/projects/{project_id}/material-cost", response_model=MaterialCostResponse)
async def get_material_cost(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    provider: StorePriceProvider = Depends(get_price_provider),
) -> MaterialCostResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    report = await MaterialCostAggregator(provider).aggregate(project_id, db)
    return MaterialCostResponse(
        total_cents=report.total_cents,
        items=[MaterialLineResponse(**asdict(i)) for i in report.items],
        missing=[MaterialLineResponse(**asdict(i)) for i in report.missing],
    )


@router.get("/projects/{project_id}/budget", response_model=BudgetResponse)
async def get_budget(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetResponse:
    from app.models.material import Budget
    await _project_for_user_or_404(project_id, current_user, db)
    budget = (await db.execute(select(Budget).where(Budget.project_id == project_id).options(selectinload(Budget.items)))).scalar_one_or_none()
    if budget is None:
        budget = Budget(project_id=project_id)
        db.add(budget)
        await db.commit()
        budget = await _budget_with_items(db, budget.id)
    return _budget_response(budget)


@router.put("/projects/{project_id}/budget", response_model=BudgetResponse)
async def upsert_budget(
    project_id: uuid.UUID,
    payload: BudgetUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetResponse:
    from app.models.material import Budget
    await _project_for_user_or_404(project_id, current_user, db)
    budget = (await db.execute(select(Budget).where(Budget.project_id == project_id).options(selectinload(Budget.items)))).scalar_one_or_none()
    if budget is None:
        budget = Budget(project_id=project_id)
        db.add(budget)
    budget.total_budget_cents = payload.total_budget_cents
    budget.contingency_pct = payload.contingency_pct
    await db.commit()
    await db.refresh(budget)
    return _budget_response(await _budget_with_items(db, budget.id))


@router.post("/projects/{project_id}/budget/items", response_model=BudgetItemResponse, status_code=status.HTTP_201_CREATED)
async def create_budget_item(
    project_id: uuid.UUID,
    payload: BudgetItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetItemResponse:
    from app.models.material import BudgetItem
    await _project_for_user_or_404(project_id, current_user, db)
    budget = await _get_or_create_budget(project_id, db)
    item = BudgetItem(budget_id=budget.id, category=payload.category, name=payload.name,
                      description=payload.description, estimated_cents=payload.estimated_cents, actual_cents=payload.actual_cents)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return BudgetItemResponse.model_validate(item)


@router.put("/projects/{project_id}/budget/items/{item_id}", response_model=BudgetItemResponse)
async def update_budget_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: BudgetItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetItemResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    item = await _get_budget_item_or_404(db, project_id, item_id)
    apply_updates(item, payload)
    await db.commit()
    await db.refresh(item)
    return BudgetItemResponse.model_validate(item)


@router.delete("/projects/{project_id}/budget/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _project_for_user_or_404(project_id, current_user, db)
    await db.delete(await _get_budget_item_or_404(db, project_id, item_id))
    await db.commit()
