"""add reviews table

Revision ID: 7a1b9c0e3f10
Revises: 30246b22cf35
Create Date: 2026-05-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7a1b9c0e3f10"
down_revision: Union[str, Sequence[str], None] = "30246b22cf35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("location_id", sa.String(255), nullable=False, index=True),
        sa.Column("external_id", sa.String(255), nullable=False, index=True),
        sa.Column("author_name", sa.String(255), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at_external", sa.String(64), nullable=True),
        sa.Column("reply_text", sa.Text(), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("location_id", "external_id", name="uq_reviews_location_ext"),
    )


def downgrade() -> None:
    op.drop_table("reviews")
