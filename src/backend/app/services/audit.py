"""Audit service — helper to record user actions into the audit log."""

from __future__ import annotations

import uuid
from typing import Any

from app.models.audit_log import AuditLog
from sqlalchemy.ext.asyncio import AsyncSession


async def log_action(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    diff: dict[str, Any] | None,
    ip_address: str | None = None,
) -> AuditLog:
    """Append an audit log entry. Caller is responsible for commit."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        diff=diff,
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
