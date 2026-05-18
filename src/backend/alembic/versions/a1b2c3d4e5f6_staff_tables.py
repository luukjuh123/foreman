"""staff_tables

Revision ID: a1b2c3d4e5f6
Revises: 30246b22cf35
Create Date: 2026-05-19 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "30246b22cf35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True
        ),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weekly_hours_target", sa.Float(), server_default="40.0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("hourly_rate_cents >= 0", name="ck_staff_hourly_rate_non_negative"),
    )

    op.create_table(
        "staff_availability",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "day_of_week >= 0 AND day_of_week <= 6", name="ck_staff_avail_dow_range"
        ),
        sa.CheckConstraint("end_time > start_time", name="ck_staff_avail_time_order"),
    )


def downgrade() -> None:
    op.drop_table("staff_availability")
    op.drop_table("staff")
