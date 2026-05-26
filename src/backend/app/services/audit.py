"""Audit service — record user actions on domain entities."""

import json
import uuid
from typing import Any

from app.models.audit_log import AuditLog
from sqlalchemy.ext.asyncio import AsyncSession


async def record_audit(
    db: AsyncSession,
    actor_id: uuid.UUID,
    actor_email: str,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    changes: Any,
) -> AuditLog:
    """Persist an AuditLog entry and return it.

    Args:
        db: async database session
        actor_id: UUID of the user who performed the action
        actor_email: email of the actor (denormalised for display)
        entity_type: domain entity type, e.g. "project", "task", "invoice"
        entity_id: UUID of the affected entity
        action: one of "create", "update", "delete"
        changes: arbitrary dict — full snapshot for create/delete,
                 {"old": {...}, "new": {...}} for updates
    """
    changes_json = json.dumps(changes) if changes is not None else None
    entry = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        changes=changes_json,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry
