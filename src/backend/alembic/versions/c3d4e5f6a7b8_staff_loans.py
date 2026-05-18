"""staff_loans

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-19 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_loans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("principal_cents", sa.Integer(), nullable=False),
        sa.Column("issued_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("principal_cents > 0", name="ck_loan_principal_positive"),
    )
    op.create_table(
        "loan_deductions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "loan_id",
            sa.Uuid(),
            sa.ForeignKey("staff_loans.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("deduction_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount_cents > 0", name="ck_loan_deduction_amount_positive"),
    )


def downgrade() -> None:
    op.drop_table("loan_deductions")
    op.drop_table("staff_loans")
