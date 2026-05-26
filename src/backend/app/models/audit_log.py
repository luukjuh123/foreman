"""AuditLog model — records every create/update/delete action with actor and diff."""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class AuditLog(Base):
    """Immutable record of a user action on a domain entity."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    # JSON-serialised diff: full snapshot for create/delete, {old, new} for update.
    changes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
