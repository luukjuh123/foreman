"""add budget_items

Revision ID: 7a1c0b2e9f01
Revises: 30246b22cf35
Create Date: 2026-05-18 14:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7a1c0b2e9f01"
down_revision: str | Sequence[str] | None = "30246b22cf35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "budget_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("budget_id", sa.Uuid(), sa.ForeignKey("budgets.id"), nullable=False, index=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("estimated_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("actual_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("budget_items")
