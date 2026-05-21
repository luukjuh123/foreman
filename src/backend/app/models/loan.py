"""StaffLoan + LoanDeduction models — voorschotten — Phase 9.

A loan (voorschot) is an advance paid to a staff member.  Subsequent
deductions reduce the outstanding balance, typically applied via payroll.
All money in integer euro cents.
"""

import uuid
from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class StaffLoan(Base):
    __tablename__ = "staff_loans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    principal_cents: Mapped[int] = mapped_column(nullable=False)
    issued_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    deductions: Mapped[list["LoanDeduction"]] = relationship(
        back_populates="loan", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("principal_cents > 0", name="ck_loan_principal_positive"),
    )


class LoanDeduction(Base):
    __tablename__ = "loan_deductions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    loan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("staff_loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    deduction_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    loan: Mapped["StaffLoan"] = relationship(back_populates="deductions")

    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_loan_deduction_amount_positive"),
    )
