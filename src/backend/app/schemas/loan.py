"""Pydantic schemas for staff loans (voorschotten) + deductions."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class LoanDeductionCreate(BaseModel):
    amount_cents: int = Field(gt=0)
    deduction_date: date
    notes: str | None = Field(default=None, max_length=500)


class LoanDeductionResponse(BaseModel):
    id: uuid.UUID
    loan_id: uuid.UUID
    amount_cents: int
    deduction_date: date
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class StaffLoanCreate(BaseModel):
    staff_id: uuid.UUID
    principal_cents: int = Field(gt=0)
    issued_date: date
    notes: str | None = Field(default=None, max_length=500)


class StaffLoanResponse(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    principal_cents: int
    issued_date: date
    notes: str | None
    created_at: datetime
    updated_at: datetime
    deductions: list[LoanDeductionResponse] = []
    deducted_cents: int = 0
    outstanding_cents: int = 0

    model_config = {"from_attributes": True}


class StaffOutstandingBalance(BaseModel):
    staff_id: uuid.UUID
    total_principal_cents: int
    total_deducted_cents: int
    outstanding_cents: int
    loans: list[StaffLoanResponse]
