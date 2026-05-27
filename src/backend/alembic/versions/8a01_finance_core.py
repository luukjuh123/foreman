"""finance core: accounts, periods, journal entries (phase 8)

Revision ID: 8a01_finance_core
Revises: 30246b22cf35
Create Date: 2026-05-18 14:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8a01_finance_core"
down_revision: str | Sequence[str] | None = "30246b22cf35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("normal_balance", sa.String(10), nullable=False),
        sa.Column("parent_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("cashflow_category", sa.String(20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("owner_id", "code", name="uq_accounts_owner_code"),
        sa.CheckConstraint(
            "account_type IN ('asset','liability','equity','revenue','expense')",
            name="ck_accounts_type",
        ),
        sa.CheckConstraint("normal_balance IN ('debit','credit')", name="ck_accounts_normal_balance"),
    )
    op.create_index("ix_accounts_owner_code", "accounts", ["owner_id", "code"])

    op.create_table(
        "accounting_periods",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("owner_id", "start_date", "end_date", name="uq_period_owner_range"),
    )

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("entry_date", sa.Date(), nullable=False, index=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("is_posted", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "entry_id",
            sa.Uuid(),
            sa.ForeignKey("journal_entries.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("debit_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("credit_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("debit_cents >= 0", name="ck_journal_lines_debit_nonneg"),
        sa.CheckConstraint("credit_cents >= 0", name="ck_journal_lines_credit_nonneg"),
        sa.CheckConstraint(
            "(debit_cents = 0) OR (credit_cents = 0)",
            name="ck_journal_lines_one_sided",
        ),
    )


def downgrade() -> None:
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_table("accounting_periods")
    op.drop_index("ix_accounts_owner_code", table_name="accounts")
    op.drop_table("accounts")
