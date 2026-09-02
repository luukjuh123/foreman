"""Audit log service — records user actions on entities."""

import uuid

from app.models.audit_log import AuditLog
from sqlalchemy.ext.asyncio import AsyncSession


async def log_action(
    db: AsyncSession,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    diff: dict | None = None,
) -> AuditLog:
    """Persist an audit log entry.

    Args:
        db: Async DB session.
        user_id: The actor performing the action.
        action: One of "create", "update", "delete".
        entity_type: e.g. "project", "invoice", "task".
        entity_id: UUID of the affected entity.
        diff: For updates, old→new values; for creates, created data summary; for deletes, deleted summary.
    """
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    entry.diff = diff
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry
