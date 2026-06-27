"""Financial report generation: balance sheet, income statement, cash flow."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

from app.models.finance import Account, JournalEntry, JournalLine
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


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
    accounts = list((await db.execute(select(Account).where(Account.owner_id == owner_id))).scalars().all())
    aggregates: dict[uuid.UUID, AccountAggregate] = {
        a.id: AccountAggregate(a.id, a.code, a.name, a.account_type, a.normal_balance, a.parent_id, a.cashflow_category)
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

    for account_id, debit, credit in (await db.execute(stmt)).all():
        if (agg := aggregates.get(account_id)) is not None:
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
    children: list[BalanceSheetNode] = field(default_factory=list)

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
            self.total_liabilities_cents + self.total_equity_cents + self.retained_earnings_cents
        )

    def to_dict(self) -> dict:
        sections = {
            name: {"accounts": [n.to_dict() for n in nodes], "total_cents": total}
            for name, nodes, total in [
                ("assets", self.assets, self.total_assets_cents),
                ("liabilities", self.liabilities, self.total_liabilities_cents),
                ("equity", self.equity, self.total_equity_cents),
            ]
        }
        return {
            "as_of": self.as_of.isoformat(),
            **sections,
            "retained_earnings_cents": self.retained_earnings_cents,
            "total_liabilities_and_equity_cents": (
                self.total_liabilities_cents + self.total_equity_cents + self.retained_earnings_cents
            ),
            "is_balanced": self.is_balanced,
        }


def _build_tree(aggregates: list[AccountAggregate], type_filter: str) -> tuple[list[BalanceSheetNode], int]:
    """Build a hierarchical tree of nodes for accounts of a given type.

    Returns (roots, total_cents). Total is the sum of root-level node balances
    (which themselves include children, so this is the true category total).
    """
    relevant = [a for a in aggregates if a.account_type == type_filter]
    by_id: dict[uuid.UUID, BalanceSheetNode] = {
        a.account_id: BalanceSheetNode(a.account_id, a.code, a.name, a.balance_cents)
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
    trees = {t: _build_tree(aggregates_to_date, t) for t in ("asset", "liability", "equity")}
    return BalanceSheet(
        as_of=as_of,
        assets=trees["asset"][0], liabilities=trees["liability"][0], equity=trees["equity"][0],
        total_assets_cents=trees["asset"][1], total_liabilities_cents=trees["liability"][1],
        total_equity_cents=trees["equity"][1], retained_earnings_cents=net_income_to_date_cents,
    )


def compute_net_income_cents(aggregates: list[AccountAggregate]) -> int:
    """Net income = revenue (credit-normal) - expense (debit-normal)."""
    return sum(
        a.balance_cents * (1 if a.account_type == "revenue" else -1)
        for a in aggregates if a.account_type in ("revenue", "expense")
    )


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
    rev, tot_rev = _build_tree(aggregates_for_period, "revenue")
    exp, tot_exp = _build_tree(aggregates_for_period, "expense")
    return IncomeStatement(
        start_date=start_date, end_date=end_date,
        revenue=rev, expenses=exp,
        total_revenue_cents=tot_rev, total_expenses_cents=tot_exp,
    )


# ---------------------------------------------------------------------------
# Cash flow statement (kasstroomoverzicht) — indirect method
# ---------------------------------------------------------------------------


@dataclass
class CashFlowLine:
    account_id: uuid.UUID
    code: str
    name: str
    change_cents: int  # signed cash impact (positive = inflow)

    def to_dict(self) -> dict:
        return {"account_id": str(self.account_id), "code": self.code, "name": self.name, "change_cents": self.change_cents}


@dataclass
class CashFlowStatement:
    start_date: date
    end_date: date
    net_income_cents: int
    operating: list[CashFlowLine]
    investing: list[CashFlowLine]
    financing: list[CashFlowLine]
    operating_cash_flow_cents: int
    investing_cash_flow_cents: int
    financing_cash_flow_cents: int
    opening_cash_cents: int
    ending_cash_cents: int
    net_change_in_cash_cents: int

    @property
    def reconciles(self) -> bool:
        """Sum of OCF + ICF + FCF must equal change in cash."""
        return (
            self.operating_cash_flow_cents + self.investing_cash_flow_cents + self.financing_cash_flow_cents
        ) == self.net_change_in_cash_cents

    def to_dict(self) -> dict:
        activities = {
            f"{k}_activities": {"lines": [l.to_dict() for l in lines], "total_cents": total}
            for k, lines, total in [
                ("operating", self.operating, self.operating_cash_flow_cents),
                ("investing", self.investing, self.investing_cash_flow_cents),
                ("financing", self.financing, self.financing_cash_flow_cents),
            ]
        }
        return {
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "net_income_cents": self.net_income_cents,
            **activities,
            "opening_cash_cents": self.opening_cash_cents,
            "ending_cash_cents": self.ending_cash_cents,
            "net_change_in_cash_cents": self.net_change_in_cash_cents,
            "reconciles": self.reconciles,
        }


def _period_change(opening: list[AccountAggregate], closing: list[AccountAggregate]) -> dict[uuid.UUID, int]:
    """For each account: closing balance - opening balance (signed)."""
    op = {a.account_id: a.balance_cents for a in opening}
    return {a.account_id: a.balance_cents - op.get(a.account_id, 0) for a in closing}


def build_cash_flow_statement(
    *,
    opening_aggregates: list[AccountAggregate],
    closing_aggregates: list[AccountAggregate],
    period_aggregates: list[AccountAggregate],
    start_date: date,
    end_date: date,
) -> CashFlowStatement:
    """Indirect-method cash flow statement.

    OCF starts from net income, then adjusts for non-cash working-capital
    changes (cashflow_category='operating'). ICF tracks 'investing' account
    changes (fixed asset acquisitions/disposals). FCF tracks 'financing'
    changes (equity contributions, long-term debt issuance/repayment).

    The accounting identity ΔAssets - ΔLiab - ΔEquity = NetIncome guarantees
    OCF + ICF + FCF == ΔCash for any set of balanced journal entries.
    """
    net_income = compute_net_income_cents(period_aggregates)

    changes = _period_change(opening_aggregates, closing_aggregates)

    # Identify cash accounts and compute opening/closing/net change in cash.
    cash_ids = {a.account_id for a in closing_aggregates if a.cashflow_category == "cash"}
    opening_cash, ending_cash = (
        sum(a.balance_cents for a in aggs if a.account_id in cash_ids)
        for aggs in (opening_aggregates, closing_aggregates)
    )

    buckets: dict[str, list[CashFlowLine]] = {"operating": [], "investing": [], "financing": []}
    by_id = {a.account_id: a for a in closing_aggregates}

    for account_id, delta in changes.items():
        a = by_id.get(account_id)
        if a is None or a.account_id in cash_ids or a.account_type in ("revenue", "expense") or delta == 0:
            continue
        cash_effect = -delta if a.normal_balance == "debit" else delta
        category = a.cashflow_category or "operating"
        if category in buckets:
            buckets[category].append(CashFlowLine(account_id=a.account_id, code=a.code, name=a.name, change_cents=cash_effect))

    sorted_buckets = {k: sorted(v, key=lambda x: x.code) for k, v in buckets.items()}
    totals = {k: sum(ln.change_cents for ln in v) for k, v in sorted_buckets.items()}
    totals["operating"] += net_income

    return CashFlowStatement(
        start_date=start_date, end_date=end_date, net_income_cents=net_income,
        **{k: sorted_buckets[k] for k in ("operating", "investing", "financing")},
        operating_cash_flow_cents=totals["operating"],
        investing_cash_flow_cents=totals["investing"],
        financing_cash_flow_cents=totals["financing"],
        opening_cash_cents=opening_cash, ending_cash_cents=ending_cash,
        net_change_in_cash_cents=ending_cash - opening_cash,
    )
