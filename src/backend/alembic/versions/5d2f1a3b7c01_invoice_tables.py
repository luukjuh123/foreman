"""invoice tables

Revision ID: 5d2f1a3b7c01
Revises: 30246b22cf35
Create Date: 2026-05-19 09:00:00

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5d2f1a3b7c01"
down_revision: Union[str, Sequence[str], None] = "30246b22cf35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("kvk_number", sa.String(20), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=True),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("country_code", sa.String(2), server_default="NL"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column(
            "customer_id", sa.Uuid(), sa.ForeignKey("customers.id"), nullable=False, index=True
        ),
        sa.Column(
            "project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=True, index=True
        ),
        sa.Column("invoice_number", sa.String(20), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("payment_terms_days", sa.Integer(), server_default="30"),
        sa.Column("currency", sa.String(3), server_default="EUR"),
        sa.Column("status", sa.String(20), server_default="draft", index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("subtotal_cents", sa.Integer(), server_default="0"),
        sa.Column("vat_total_cents", sa.Integer(), server_default="0"),
        sa.Column("total_cents", sa.Integer(), server_default="0"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("owner_id", "invoice_number", name="uq_invoice_owner_number"),
    )

    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invoice_id", sa.Uuid(), sa.ForeignKey("invoices.id"), nullable=False, index=True
        ),
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
        "invoice_counters",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_number", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("owner_id", "year", name="uq_invoice_counter_owner_year"),
    )


def downgrade() -> None:
    op.drop_table("invoice_counters")
    op.drop_table("invoice_lines")
    op.drop_table("invoices")
    op.drop_table("customers")
