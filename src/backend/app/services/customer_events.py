"""Customer event recording helper.

Single entry point for persisting CustomerEvent rows. Used by the
timeline/summary endpoints and by other services (invoices, reports,
notifications) to record interactions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.models.customer_event import CustomerEvent
from sqlalchemy.ext.asyncio import AsyncSession


async def record_event(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID,
    event_type: str,
    description: str,
    reference_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    timestamp: datetime | None = None,
) -> CustomerEvent:
    """Persist a CustomerEvent row and return it (caller must commit).

    Args:
        db: Active async DB session.
        customer_id: FK to crm_customers.id.
        event_type: One of CUSTOMER_EVENT_TYPES.
        description: Human-readable summary of the event.
        reference_id: Optional UUID of the related object (invoice, report, …).
        metadata: Optional JSON payload with extra details.
        timestamp: Event time; defaults to now(UTC).

    Returns:
        The persisted (but not yet committed) CustomerEvent instance.
    """
    event = CustomerEvent(
        customer_id=customer_id,
        event_type=event_type,
        description=description,
        reference_id=reference_id,
        metadata=metadata,
        timestamp=timestamp or datetime.now(UTC),
    )
    db.add(event)
    return event
