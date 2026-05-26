"""subscriptions + usage counter tables.

Revision ID: u51agem3t3r2
Revises: b17c5ub5cr1p
Create Date: 2026-05-19 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "u51agem3t3r2"
down_revision: str | Sequence[str] | None = "b17c5ub5cr1p"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Uuid(),
            sa.ForeignKey("users.id"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("project_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("user_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("storage_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("usage_counters")
