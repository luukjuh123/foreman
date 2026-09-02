"""AuditLog model — tracks all user actions (create/update/delete) with timestamp, actor, and diff."""

import uuid
from datetime import datetime

from app.core.database import Base
from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # create|update|delete
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    # JSON stored as Text; None for actions with no diff
    _diff: Mapped[str | None] = mapped_column("diff", Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
    )

    @property
    def diff(self) -> dict | None:
        import json
        if self._diff is None:
            return None
        return json.loads(self._diff)

    @diff.setter
    def diff(self, value: dict | None) -> None:
        import json
        if value is None:
            self._diff = None
        else:
            self._diff = json.dumps(value)
