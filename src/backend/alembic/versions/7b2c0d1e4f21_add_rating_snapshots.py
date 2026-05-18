"""add rating_snapshots table

Revision ID: 7b2c0d1e4f21
Revises: 7a1b9c0e3f10
Create Date: 2026-05-19 00:01:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7b2c0d1e4f21"
down_revision: Union[str, Sequence[str], None] = "7a1b9c0e3f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rating_snapshots",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("location_id", sa.String(255), nullable=False, index=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False, index=True),
        sa.Column("average_rating", sa.Float(), nullable=False),
        sa.Column("review_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "location_id", "snapshot_date", name="uq_rating_snapshots_loc_date"
        ),
    )


def downgrade() -> None:
    op.drop_table("rating_snapshots")
