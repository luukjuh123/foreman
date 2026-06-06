"""subcontractor_management

Revision ID: f1a2b3c4d5e6
Revises: u51agem3t3r2
Create Date: 2026-05-26 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "u51agem3t3r2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # subcontractors
    op.create_table(
        "subcontractors",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("kvk_number", sa.String(20), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("specialties_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fixed_rate_cents", sa.Integer(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("hourly_rate_cents >= 0", name="ck_sub_hourly_rate_non_negative"),
        sa.CheckConstraint(
            "fixed_rate_cents IS NULL OR fixed_rate_cents >= 0",
            name="ck_sub_fixed_rate_non_negative",
        ),
        sa.CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_sub_rating_range"),
    )

    # subcontractor_certifications
    op.create_table(
        "subcontractor_certifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "subcontractor_id",
            sa.Uuid(),
            sa.ForeignKey("subcontractors.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("cert_type", sa.String(20), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("cert_type IN ('VCA','BRL')", name="ck_sub_cert_type"),
    )

    # subcontractor_assignments
    op.create_table(
        "subcontractor_assignments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column(
            "subcontractor_id",
            sa.Uuid(),
            sa.ForeignKey("subcontractors.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "phase_id",
            sa.Uuid(),
            sa.ForeignKey("phases.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "task_id",
            sa.Uuid(),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("estimated_hours", sa.Float(), nullable=False, server_default="0"),
        sa.Column("actual_hours", sa.Float(), nullable=False, server_default="0"),
        sa.Column("agreed_rate_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("agreed_fixed_cost_cents", sa.Integer(), nullable=True),
        sa.Column("total_cost_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("estimated_hours >= 0", name="ck_sub_assign_est_hours_non_neg"),
        sa.CheckConstraint("actual_hours >= 0", name="ck_sub_assign_actual_hours_non_neg"),
        sa.CheckConstraint("agreed_rate_cents >= 0", name="ck_sub_assign_rate_non_neg"),
        sa.CheckConstraint(
            "agreed_fixed_cost_cents IS NULL OR agreed_fixed_cost_cents >= 0",
            name="ck_sub_assign_fixed_cost_non_neg",
        ),
    )
    op.create_index(
        "ix_sub_assign_project",
        "subcontractor_assignments",
        ["project_id", "subcontractor_id"],
    )

    # subcontractor_invoices
    op.create_table(
        "subcontractor_invoices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column(
            "subcontractor_id",
            sa.Uuid(),
            sa.ForeignKey("subcontractors.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "assignment_id",
            sa.Uuid(),
            sa.ForeignKey("subcontractor_assignments.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "journal_entry_id",
            sa.Uuid(),
            sa.ForeignKey("journal_entries.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("invoice_reference", sa.String(100), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("vat_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="received", index=True),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount_cents >= 0", name="ck_sub_inv_amount_non_neg"),
        sa.CheckConstraint("vat_cents >= 0", name="ck_sub_inv_vat_non_neg"),
    )
    op.create_index(
        "ix_sub_inv_project_sub",
        "subcontractor_invoices",
        ["project_id", "subcontractor_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_sub_inv_project_sub", table_name="subcontractor_invoices")
    op.drop_table("subcontractor_invoices")
    op.drop_index("ix_sub_assign_project", table_name="subcontractor_assignments")
    op.drop_table("subcontractor_assignments")
    op.drop_table("subcontractor_certifications")
    op.drop_table("subcontractors")
