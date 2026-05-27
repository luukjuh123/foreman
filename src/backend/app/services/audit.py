"""Audit service — records user actions to the audit log."""

import uuid
from typing import Any

from app.models.audit_log import AuditLog
from sqlalchemy.ext.asyncio import AsyncSession


async def record_audit(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID,
    diff: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Insert an audit log entry and return it."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        diff=diff,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry
