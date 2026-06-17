"""quotes tables

Revision ID: q1u2o3t4e5s6
Revises: p1u2n3c4h5i6
Create Date: 2026-06-12 00:00:00.000000

"""

from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

revision: str = "q1u2o3t4e5s6"
down_revision: str | Sequence[str] | None = "p1u2n3c4h5i6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quotes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("customer_id", sa.Uuid(), sa.ForeignKey("customers.id"), nullable=False, index=True),
        sa.Column("quote_number", sa.String(20), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("subtotal_cents", sa.Integer(), server_default="0"),
        sa.Column("vat_total_cents", sa.Integer(), server_default="0"),
        sa.Column("total_cents", sa.Integer(), server_default="0"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("owner_id", "quote_number", name="uq_quote_owner_number"),
    )

    op.create_table(
        "quote_lines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("quote_id", sa.Uuid(), sa.ForeignKey("quotes.id"), nullable=False, index=True),
        sa.Column("position", sa.Integer(), server_default="0"),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Float(), server_default="1.0"),
        sa.Column("unit", sa.String(20), server_default="piece"),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("vat_rate_bp", sa.Integer(), nullable=False),
        sa.Column("line_net_cents", sa.Integer(), server_default="0"),
        sa.Column("line_vat_cents", sa.Integer(), server_default="0"),
    )

    op.create_table(
        "quote_counters",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_number", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("owner_id", "year", name="uq_quote_counter_owner_year"),
    )


def downgrade() -> None:
    op.drop_table("quote_counters")
    op.drop_table("quote_lines")
    op.drop_table("quotes")
