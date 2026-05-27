"""Customer timeline router — GET /api/v1/customers/{id}/timeline."""

from __future__ import annotations

import uuid
from typing import Annotated

from app.core.database import get_db
from app.models.customer import Customer
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.timeline import EventType, TimelineResponse
from app.services.timeline import get_customer_timeline
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_customer_or_404(
    customer_id: uuid.UUID,
    owner_id: uuid.UUID,
    db: AsyncSession,
) -> Customer:
    # owner_id may be NULL for customers created without auth context (legacy rows).
    # Accept rows where owner_id matches OR is NULL.
    from sqlalchemy import or_
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            or_(Customer.owner_id == owner_id, Customer.owner_id.is_(None)),
            Customer.deleted_at.is_(None),
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return customer


@router.get(
    "/customers/{customer_id}/timeline",
    response_model=TimelineResponse,
    summary="Customer communication timeline",
    tags=["customers"],
)
async def get_timeline(
    customer_id: uuid.UUID,
    event_type: Annotated[EventType | None, Query(description="Filter by event type")] = None,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
    limit: Annotated[int, Query(ge=1, le=100, description="Page size (max 100)")] = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimelineResponse:
    await _get_customer_or_404(customer_id, current_user.id, db)

    return await get_customer_timeline(
        db=db,
        customer_id=customer_id,
        owner_id=current_user.id,
        event_type=event_type,
        offset=offset,
        limit=limit,
    )
