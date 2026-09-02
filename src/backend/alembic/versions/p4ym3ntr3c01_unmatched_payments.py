"""Add unmatched_payments table for invoice payment reconciliation.

Revision ID: p4ym3ntr3c01
Revises: u51agem3t3r2
Create Date: 2026-05-26 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "p4ym3ntr3c01"
down_revision: str | None = "u51agem3t3r2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "unmatched_payments",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("mollie_payment_id", sa.String(100), nullable=False, unique=True),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("raw_payload", sa.String(4000), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_unmatched_payments_mollie_payment_id",
        "unmatched_payments",
        ["mollie_payment_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_unmatched_payments_mollie_payment_id", table_name="unmatched_payments")
    op.drop_table("unmatched_payments")
