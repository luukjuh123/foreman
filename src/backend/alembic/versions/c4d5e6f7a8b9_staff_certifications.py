"""staff_certifications table — Phase 21

Revision ID: c4d5e6f7a8b9
Revises: p1u2n3c4h5i6
Create Date: 2026-05-27 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "p1u2n3c4h5i6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "staff_certifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("cert_type", sa.String(50), nullable=False),
        sa.Column("cert_name", sa.String(255), nullable=False),
        sa.Column("issued_at", sa.Date(), nullable=False),
        sa.Column("expires_at", sa.Date(), nullable=False),
        sa.Column("document_path", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("staff_certifications")
