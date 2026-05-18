"""inbound_inquiries table

Revision ID: c2d7f3a481b9
Revises: 8a1c4f9b2e10
Create Date: 2026-05-18 14:50:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d7f3a481b9"
down_revision: Union[str, Sequence[str], None] = "8a1c4f9b2e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inbound_inquiries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False, index=True),
        sa.Column("from_email", sa.String(255), nullable=True),
        sa.Column("from_name", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("raw", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("inbound_inquiries")
