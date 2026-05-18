"""Financial report generation: balance sheet, income statement, cash flow."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import Account, JournalEntry, JournalLine


@dataclass
class AccountAggregate:
    account_id: uuid.UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    parent_id: uuid.UUID | None
    cashflow_category: str | None
    debit_total_cents: int = 0
    credit_total_cents: int = 0

    @property
    def balance_cents(self) -> int:
        """Signed balance in the account's natural direction.

        For debit-normal accounts (asset, expense) → debit - credit (positive
        = increase). For credit-normal (liability, equity, revenue) → credit
        - debit. Reported balances are always non-negative for healthy books.
        """
        if self.normal_balance == "debit":
            return self.debit_total_cents - self.credit_total_cents
        return self.credit_total_cents - self.debit_total_cents


async def aggregate_balances(
    db: AsyncSession,
    owner_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[AccountAggregate]:
    """Sum debits/credits per account over an (optional) date window.

    `start_date` and `end_date` are inclusive. `start_date=None` → since the
    beginning of time (used for balance sheet cumulative). For income
    statement use `start_date` and `end_date`. Entries must be posted.
    """
    acc_result = await db.execute(
        select(Account).where(Account.owner_id == owner_id)
    )
    accounts = list(acc_result.scalars().all())
    aggregates: dict[uuid.UUID, AccountAggregate] = {
        a.id: AccountAggregate(
            account_id=a.id,
            code=a.code,
            name=a.name,
            account_type=a.account_type,
            normal_balance=a.normal_balance,
            parent_id=a.parent_id,
            cashflow_category=a.cashflow_category,
        )
        for a in accounts
    }

    stmt = (
        select(
            JournalLine.account_id,
            JournalLine.debit_cents,
            JournalLine.credit_cents,
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(
            JournalEntry.owner_id == owner_id,
            JournalEntry.is_posted.is_(True),
        )
    )
    if start_date is not None:
        stmt = stmt.where(JournalEntry.entry_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(JournalEntry.entry_date <= end_date)

    result = await db.execute(stmt)
    for account_id, debit, credit in result.all():
        agg = aggregates.get(account_id)
        if agg is None:
            continue
        agg.debit_total_cents += int(debit or 0)
        agg.credit_total_cents += int(credit or 0)
    return list(aggregates.values())


# ---------------------------------------------------------------------------
# Balance sheet
# ---------------------------------------------------------------------------


@dataclass
class BalanceSheetNode:
    account_id: uuid.UUID
    code: str
    name: str
    balance_cents: int
    children: list["BalanceSheetNode"] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "account_id": str(self.account_id),
            "code": self.code,
            "name": self.name,
            "balance_cents": self.balance_cents,
            "children": [c.to_dict() for c in self.children],
        }


@dataclass
class BalanceSheet:
    as_of: date
    assets: list[BalanceSheetNode]
    liabilities: list[BalanceSheetNode]
    equity: list[BalanceSheetNode]
    total_assets_cents: int
    total_liabilities_cents: int
    total_equity_cents: int
    retained_earnings_cents: int  # net income for the period to date

    @property
    def is_balanced(self) -> bool:
        return self.total_assets_cents == (
            self.total_liabilities_cents
            + self.total_equity_cents
            + self.retained_earnings_cents
        )

    def to_dict(self) -> dict:
        return {
            "as_of": self.as_of.isoformat(),
            "assets": {
                "accounts": [n.to_dict() for n in self.assets],
                "total_cents": self.total_assets_cents,
            },
            "liabilities": {
                "accounts": [n.to_dict() for n in self.liabilities],
                "total_cents": self.total_liabilities_cents,
            },
            "equity": {
                "accounts": [n.to_dict() for n in self.equity],
                "total_cents": self.total_equity_cents,
            },
            "retained_earnings_cents": self.retained_earnings_cents,
            "total_liabilities_and_equity_cents": (
                self.total_liabilities_cents
                + self.total_equity_cents
                + self.retained_earnings_cents
            ),
            "is_balanced": self.is_balanced,
        }


def _build_tree(
    aggregates: list[AccountAggregate], type_filter: str
) -> tuple[list[BalanceSheetNode], int]:
    """Build a hierarchical tree of nodes for accounts of a given type.

    Returns (roots, total_cents). Total is the sum of root-level node balances
    (which themselves include children, so this is the true category total).
    """
    relevant = [a for a in aggregates if a.account_type == type_filter]
    by_id: dict[uuid.UUID, BalanceSheetNode] = {
        a.account_id: BalanceSheetNode(
            account_id=a.account_id,
            code=a.code,
            name=a.name,
            balance_cents=a.balance_cents,
        )
        for a in relevant
    }
    relevant_ids = set(by_id)
    roots: list[BalanceSheetNode] = []
    for a in relevant:
        node = by_id[a.account_id]
        if a.parent_id is not None and a.parent_id in relevant_ids:
            by_id[a.parent_id].children.append(node)
        else:
            roots.append(node)

    # Aggregate child balances into parents (rollup).
    def rollup(node: BalanceSheetNode) -> int:
        for child in node.children:
            node.balance_cents += rollup(child)
        return node.balance_cents

    # The leaf balance contributions only — for root totals we need to NOT
    # double-count parents that themselves have leaf balances. Standard
    # approach: keep leaf balances and only roll children into parents that
    # do not have their own non-zero balance. To stay correct in the general
    # case we choose: a parent's reported balance = sum(child balances) +
    # any direct postings on that parent. This is what `rollup` already does.
    roots.sort(key=lambda n: n.code)
    for r in roots:
        rollup(r)
    total = sum(r.balance_cents for r in roots)
    return roots, total


def build_balance_sheet(
    aggregates_to_date: list[AccountAggregate],
    *,
    as_of: date,
    net_income_to_date_cents: int,
) -> BalanceSheet:
    """Balance sheet at `as_of`. Net income flows to retained earnings."""
    assets, total_assets = _build_tree(aggregates_to_date, "asset")
    liabilities, total_liab = _build_tree(aggregates_to_date, "liability")
    equity, total_equity = _build_tree(aggregates_to_date, "equity")
    return BalanceSheet(
        as_of=as_of,
        assets=assets,
        liabilities=liabilities,
        equity=equity,
        total_assets_cents=total_assets,
        total_liabilities_cents=total_liab,
        total_equity_cents=total_equity,
        retained_earnings_cents=net_income_to_date_cents,
    )


def compute_net_income_cents(aggregates: list[AccountAggregate]) -> int:
    """Net income = revenue (credit-normal) - expense (debit-normal)."""
    revenue = sum(a.balance_cents for a in aggregates if a.account_type == "revenue")
    expense = sum(a.balance_cents for a in aggregates if a.account_type == "expense")
    return revenue - expense


# ---------------------------------------------------------------------------
# Income statement (winst- en verliesrekening)
# ---------------------------------------------------------------------------


@dataclass
class IncomeStatement:
    start_date: date
    end_date: date
    revenue: list[BalanceSheetNode]
    expenses: list[BalanceSheetNode]
    total_revenue_cents: int
    total_expenses_cents: int

    @property
    def net_income_cents(self) -> int:
        return self.total_revenue_cents - self.total_expenses_cents

    def to_dict(self) -> dict:
        return {
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "revenue": {
                "accounts": [n.to_dict() for n in self.revenue],
                "total_cents": self.total_revenue_cents,
            },
            "expenses": {
                "accounts": [n.to_dict() for n in self.expenses],
                "total_cents": self.total_expenses_cents,
            },
            "net_income_cents": self.net_income_cents,
            "is_profit": self.net_income_cents > 0,
        }


def build_income_statement(
    aggregates_for_period: list[AccountAggregate],
    *,
    start_date: date,
    end_date: date,
) -> IncomeStatement:
    revenue_tree, total_rev = _build_tree(aggregates_for_period, "revenue")
    expense_tree, total_exp = _build_tree(aggregates_for_period, "expense")
    return IncomeStatement(
        start_date=start_date,
        end_date=end_date,
        revenue=revenue_tree,
        expenses=expense_tree,
        total_revenue_cents=total_rev,
        total_expenses_cents=total_exp,
    )
