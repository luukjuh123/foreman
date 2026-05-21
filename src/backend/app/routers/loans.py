"""Staff loans router — voorschotten, deductions, outstanding balances."""

import uuid

from app.core.database import get_db
from app.models.loan import LoanDeduction, StaffLoan
from app.models.staff import Staff
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.loan import (
    LoanDeductionCreate,
    LoanDeductionResponse,
    StaffLoanCreate,
    StaffLoanResponse,
    StaffOutstandingBalance,
)
from app.services.payroll.loans import compute_outstanding
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


async def _get_owned_staff(staff_id: uuid.UUID, user: User, db: AsyncSession) -> Staff:
    result = await db.execute(
        select(Staff).where(
            Staff.id == staff_id,
            Staff.owner_id == user.id,
            Staff.deleted_at.is_(None),
        )
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return staff


async def _get_owned_loan(loan_id: uuid.UUID, user: User, db: AsyncSession) -> StaffLoan:
    result = await db.execute(
        select(StaffLoan)
        .join(Staff, StaffLoan.staff_id == Staff.id)
        .where(StaffLoan.id == loan_id, Staff.owner_id == user.id)
        .options(selectinload(StaffLoan.deductions))
    )
    loan = result.scalar_one_or_none()
    if loan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    return loan


def _to_response(loan: StaffLoan) -> StaffLoanResponse:
    deducted = sum(d.amount_cents for d in loan.deductions)
    outstanding = compute_outstanding(loan.principal_cents, [d.amount_cents for d in loan.deductions])
    resp = StaffLoanResponse.model_validate(loan)
    resp.deducted_cents = deducted
    resp.outstanding_cents = outstanding
    return resp


@router.post("/", response_model=StaffLoanResponse, status_code=status.HTTP_201_CREATED)
async def issue_loan(
    body: StaffLoanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffLoanResponse:
    await _get_owned_staff(body.staff_id, current_user, db)
    loan = StaffLoan(
        staff_id=body.staff_id,
        principal_cents=body.principal_cents,
        issued_date=body.issued_date,
        notes=body.notes,
    )
    db.add(loan)
    await db.commit()
    return await get_loan(loan.id, current_user, db)


@router.get("/{loan_id}", response_model=StaffLoanResponse)
async def get_loan(
    loan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffLoanResponse:
    loan = await _get_owned_loan(loan_id, current_user, db)
    return _to_response(loan)


@router.post(
    "/{loan_id}/deductions",
    response_model=LoanDeductionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_deduction(
    loan_id: uuid.UUID,
    body: LoanDeductionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LoanDeductionResponse:
    loan = await _get_owned_loan(loan_id, current_user, db)
    already = sum(d.amount_cents for d in loan.deductions)
    if already + body.amount_cents > loan.principal_cents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Deduction would exceed loan principal",
        )
    ded = LoanDeduction(
        loan_id=loan.id,
        amount_cents=body.amount_cents,
        deduction_date=body.deduction_date,
        notes=body.notes,
    )
    db.add(ded)
    await db.commit()
    await db.refresh(ded)
    return LoanDeductionResponse.model_validate(ded)


@router.get("/staff/{staff_id}/balance", response_model=StaffOutstandingBalance)
async def staff_balance(
    staff_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffOutstandingBalance:
    await _get_owned_staff(staff_id, current_user, db)
    rows = (
        (
            await db.execute(
                select(StaffLoan)
                .where(StaffLoan.staff_id == staff_id)
                .options(selectinload(StaffLoan.deductions))
                .order_by(StaffLoan.issued_date.asc())
            )
        )
        .scalars()
        .all()
    )
    loans = [_to_response(loan) for loan in rows]
    total_principal = sum(loan.principal_cents for loan in loans)
    total_deducted = sum(loan.deducted_cents for loan in loans)
    outstanding = sum(loan.outstanding_cents for loan in loans)
    return StaffOutstandingBalance(
        staff_id=staff_id,
        total_principal_cents=total_principal,
        total_deducted_cents=total_deducted,
        outstanding_cents=outstanding,
        loans=loans,
    )
