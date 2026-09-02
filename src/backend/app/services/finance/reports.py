from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
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
        return (
            self.debit_total_cents - self.credit_total_cents
            if self.normal_balance == "debit"
            else self.credit_total_cents - self.debit_total_cents
        )


async def aggregate_balances(
    db: AsyncSession,
    owner_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[AccountAggregate]:
    accounts = (await db.execute(select(Account).where(Account.owner_id == owner_id))).scalars().all()
    aggregates: dict[uuid.UUID, AccountAggregate] = {
        a.id: AccountAggregate(a.id, a.code, a.name, a.account_type, a.normal_balance, a.parent_id, a.cashflow_category)
        for a in accounts
    }
    stmt = (
        select(JournalLine.account_id, JournalLine.debit_cents, JournalLine.credit_cents)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.owner_id == owner_id, JournalEntry.is_posted.is_(True))
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


@dataclass
class BalanceSheetNode:
    account_id: uuid.UUID
    code: str
    name: str
    balance_cents: int
    children: list[BalanceSheetNode] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"account_id": str(self.account_id), "code": self.code, "name": self.name,
                "balance_cents": self.balance_cents, "children": [c.to_dict() for c in self.children]}


@dataclass
class BalanceSheet:
    as_of: date
    assets: list[BalanceSheetNode]
    liabilities: list[BalanceSheetNode]
    equity: list[BalanceSheetNode]
    total_assets_cents: int
    total_liabilities_cents: int
    total_equity_cents: int
    retained_earnings_cents: int

    @property
    def is_balanced(self) -> bool:
        return self.total_assets_cents == (
            self.total_liabilities_cents + self.total_equity_cents + self.retained_earnings_cents
        )

    def to_dict(self) -> dict:
        return {
            "as_of": self.as_of.isoformat(),
            **{name: {"accounts": [n.to_dict() for n in nodes], "total_cents": total}
               for name, nodes, total in [("assets", self.assets, self.total_assets_cents),
                                           ("liabilities", self.liabilities, self.total_liabilities_cents),
                                           ("equity", self.equity, self.total_equity_cents)]},
            "retained_earnings_cents": self.retained_earnings_cents,
            "total_liabilities_and_equity_cents": self.total_liabilities_cents + self.total_equity_cents + self.retained_earnings_cents,
            "is_balanced": self.is_balanced,
        }


def _build_tree(aggregates: list[AccountAggregate], type_filter: str) -> tuple[list[BalanceSheetNode], int]:
    relevant = [a for a in aggregates if a.account_type == type_filter]
    by_id = {a.account_id: BalanceSheetNode(a.account_id, a.code, a.name, a.balance_cents) for a in relevant}
    roots: list[BalanceSheetNode] = []
    for a in relevant:
        (by_id[a.parent_id].children if a.parent_id in by_id else roots).append(by_id[a.account_id])

    def rollup(n: BalanceSheetNode) -> int:
        for c in n.children:
            n.balance_cents += rollup(c)
        return n.balance_cents

    roots.sort(key=lambda n: n.code)
    for r in roots:
        rollup(r)
    return roots, sum(r.balance_cents for r in roots)


def build_balance_sheet(
    aggregates_to_date: list[AccountAggregate],
    *,
    as_of: date,
    net_income_to_date_cents: int,
) -> BalanceSheet:
    (a_n, a_t), (l_n, l_t), (e_n, e_t) = (_build_tree(aggregates_to_date, t) for t in ("asset", "liability", "equity"))
    return BalanceSheet(
        as_of=as_of, assets=a_n, liabilities=l_n, equity=e_n,
        total_assets_cents=a_t, total_liabilities_cents=l_t,
        total_equity_cents=e_t, retained_earnings_cents=net_income_to_date_cents,
    )


def compute_net_income_cents(aggregates: list[AccountAggregate]) -> int:
    return sum(
        a.balance_cents * (1 if a.account_type == "revenue" else -1)
        for a in aggregates if a.account_type in ("revenue", "expense")
    )


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
            "start_date": self.start_date.isoformat(), "end_date": self.end_date.isoformat(),
            **{k: {"accounts": [n.to_dict() for n in nodes], "total_cents": total}
               for k, nodes, total in [("revenue", self.revenue, self.total_revenue_cents), ("expenses", self.expenses, self.total_expenses_cents)]},
            "net_income_cents": self.net_income_cents, "is_profit": self.net_income_cents > 0,
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


@dataclass
class CashFlowLine:
    account_id: uuid.UUID
    code: str
    name: str
    change_cents: int

    def to_dict(self) -> dict:
        return {**asdict(self), "account_id": str(self.account_id)}


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
        return (
            self.operating_cash_flow_cents + self.investing_cash_flow_cents + self.financing_cash_flow_cents
        ) == self.net_change_in_cash_cents

    def to_dict(self) -> dict:
        return {
            "start_date": self.start_date.isoformat(), "end_date": self.end_date.isoformat(),
            "net_income_cents": self.net_income_cents,
            **{f"{k}_activities": {"lines": [l.to_dict() for l in lines], "total_cents": total}
               for k, lines, total in [("operating", self.operating, self.operating_cash_flow_cents),
                                        ("investing", self.investing, self.investing_cash_flow_cents),
                                        ("financing", self.financing, self.financing_cash_flow_cents)]},
            "opening_cash_cents": self.opening_cash_cents, "ending_cash_cents": self.ending_cash_cents,
            "net_change_in_cash_cents": self.net_change_in_cash_cents, "reconciles": self.reconciles,
        }


def _period_change(opening: list[AccountAggregate], closing: list[AccountAggregate]) -> dict[uuid.UUID, int]:
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
    net_income = compute_net_income_cents(period_aggregates)
    changes = _period_change(opening_aggregates, closing_aggregates)
    cash_ids = {a.account_id for a in closing_aggregates if a.cashflow_category == "cash"}
    opening_cash, ending_cash = (
        sum(a.balance_cents for a in aggs if a.account_id in cash_ids)
        for aggs in (opening_aggregates, closing_aggregates)
    )
    buckets: dict[str, list[CashFlowLine]] = {"operating": [], "investing": [], "financing": []}
    by_id = {a.account_id: a for a in closing_aggregates}
    for aid, delta in changes.items():
        if (a := by_id.get(aid)) and aid not in cash_ids and a.account_type not in ("revenue", "expense") and delta != 0 and (cat := a.cashflow_category or "operating") in buckets:
            buckets[cat].append(CashFlowLine(a.account_id, a.code, a.name, -delta if a.normal_balance == "debit" else delta))
    sb = {k: sorted(v, key=lambda x: x.code) for k, v in buckets.items()}
    totals = {k: sum(ln.change_cents for ln in v) for k, v in sb.items()}
    totals["operating"] += net_income
    return CashFlowStatement(
        start_date=start_date, end_date=end_date, net_income_cents=net_income,
        **{k: sb[k] for k in buckets},
        **{f"{k}_cash_flow_cents": totals[k] for k in buckets},
        opening_cash_cents=opening_cash, ending_cash_cents=ending_cash,
        net_change_in_cash_cents=ending_cash - opening_cash,
    )
