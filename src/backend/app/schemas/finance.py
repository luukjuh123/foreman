"""Pydantic schemas for financial endpoints."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

AccountType = Literal["asset", "liability", "equity", "revenue", "expense"]
NormalBalance = Literal["debit", "credit"]
CashflowCategory = Literal["operating", "investing", "financing", "cash"]


class AccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=255)
    account_type: AccountType
    normal_balance: NormalBalance
    parent_id: uuid.UUID | None = None
    cashflow_category: CashflowCategory | None = None
    description: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    cashflow_category: CashflowCategory | None = None
    description: str | None = None


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    parent_id: uuid.UUID | None
    cashflow_category: str | None
    description: str | None
    is_active: bool
    created_at: datetime


class AccountTreeNode(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    account_type: str
    normal_balance: str
    cashflow_category: str | None
    is_active: bool
    children: list["AccountTreeNode"] = Field(default_factory=list)


AccountTreeNode.model_rebuild()


# ---------------------------------------------------------------------------
# Journal entries
# ---------------------------------------------------------------------------


class JournalLineInput(BaseModel):
    account_id: uuid.UUID
    debit_cents: int = Field(ge=0, default=0)
    credit_cents: int = Field(ge=0, default=0)
    description: str | None = None

    @model_validator(mode="after")
    def one_side_only(self) -> "JournalLineInput":
        if self.debit_cents > 0 and self.credit_cents > 0:
            raise ValueError("Line must be either debit or credit, not both")
        if self.debit_cents == 0 and self.credit_cents == 0:
            raise ValueError("Line must have a non-zero debit or credit amount")
        return self


class JournalEntryCreate(BaseModel):
    entry_date: date
    description: str = Field(min_length=1, max_length=500)
    reference: str | None = None
    lines: list[JournalLineInput] = Field(min_length=2)

    @model_validator(mode="after")
    def debits_equal_credits(self) -> "JournalEntryCreate":
        total_debit = sum(line.debit_cents for line in self.lines)
        total_credit = sum(line.credit_cents for line in self.lines)
        if total_debit != total_credit:
            raise ValueError(
                f"Debits must equal credits: debit={total_debit} credit={total_credit}"
            )
        if total_debit == 0:
            raise ValueError("Entry must have non-zero amounts")
        return self


class JournalLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    account_id: uuid.UUID
    debit_cents: int
    credit_cents: int
    description: str | None


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entry_date: date
    description: str
    reference: str | None
    is_posted: bool
    created_at: datetime
    lines: list[JournalLineResponse]


class AccountBalance(BaseModel):
    account_id: uuid.UUID
    code: str
    name: str
    account_type: str
    debit_total_cents: int
    credit_total_cents: int
    balance_cents: int  # signed by normal balance: positive = increase


# ---------------------------------------------------------------------------
# Accounting periods
# ---------------------------------------------------------------------------


class PeriodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def end_after_start(self) -> "PeriodCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class PeriodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    is_locked: bool
    locked_at: datetime | None
    created_at: datetime
