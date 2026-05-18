"""Pydantic schemas for financial endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
