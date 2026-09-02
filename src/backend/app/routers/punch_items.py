"""Punch items router — nakijklijst (snag list) for a project."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.database import get_db
from app.models.project import Project, Task
from app.models.punch_item import PunchItem
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.punch_item import (
    BulkStatusResult,
    BulkStatusUpdate,
    PunchItemCreate,
    PunchItemListResponse,
    PunchItemResponse,
    PunchItemSummary,
    PunchItemUpdate,
)
from app.routers.deps import add_commit_refresh_validate, apply_updates, commit_refresh_validate, get_or_404, get_owned_project_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

_RESOLVED_STATUSES = {"fixed", "verified"}


async def _get_item_or_404(project_id: uuid.UUID, item_id: uuid.UUID, db: AsyncSession) -> PunchItem:
    return await get_or_404(db, PunchItem, PunchItem.id == item_id, PunchItem.project_id == project_id, detail="Punch item not found")


def _apply_resolved_at(item: PunchItem, new_status: str) -> None:
    """Set resolved_at when moving to a resolved status; clear on reopen."""
    if new_status in _RESOLVED_STATUSES and item.resolved_at is None:
        item.resolved_at = datetime.now(UTC)
    elif new_status == "open":
        item.resolved_at = None


# ---------------------------------------------------------------------------
# Summary — must be before /{item_id} to avoid routing conflict
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}/punch-items/summary",
    response_model=list[PunchItemSummary],
)
async def punch_items_summary(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PunchItemSummary]:
    """Per-task punch item counts for agenda day badges."""
    await get_owned_project_or_404(project_id, user, db)

    task_rows = (await db.execute(
        select(
            PunchItem.task_id, func.count().label("total"),
            func.sum(case((PunchItem.status == "open", 1), else_=0)).label("open_count"),
            func.sum(case((PunchItem.status == "fixed", 1), else_=0)).label("fixed_count"),
            func.sum(case((PunchItem.status == "verified", 1), else_=0)).label("verified_count"),
        ).where(PunchItem.project_id == project_id).group_by(PunchItem.task_id)
    )).all()

    task_ids = [r.task_id for r in task_rows if r.task_id]
    task_names = {r.id: r.name for r in (await db.execute(select(Task.id, Task.name).where(Task.id.in_(task_ids)))).all()} if task_ids else {}

    return [
        PunchItemSummary(
            task_id=r.task_id,
            task_name=task_names.get(r.task_id) if r.task_id else None,
            open=r.open_count or 0,
            fixed=r.fixed_count or 0,
            verified=r.verified_count or 0,
            total=r.total,
        )
        for r in task_rows
    ]


# ---------------------------------------------------------------------------
# Bulk status update — must be before /{item_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/{project_id}/punch-items/bulk-status",
    response_model=BulkStatusResult,
)
async def bulk_update_status(
    project_id: uuid.UUID,
    body: BulkStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkStatusResult:
    await get_owned_project_or_404(project_id, user, db)

    items = (await db.execute(
        select(PunchItem).where(PunchItem.project_id == project_id, PunchItem.id.in_(body.ids))
    )).scalars().all()

    for item in items:
        _apply_resolved_at(item, body.status)
        item.status = body.status

    await db.commit()
    return BulkStatusResult(updated=len(items))


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/punch-items",
    response_model=PunchItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_punch_item(
    project_id: uuid.UUID,
    body: PunchItemCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PunchItemResponse:
    await get_owned_project_or_404(project_id, user, db)

    item = PunchItem(project_id=project_id, **body.model_dump())
    if item.status in _RESOLVED_STATUSES:
        item.resolved_at = datetime.now(UTC)

    return await add_commit_refresh_validate(db, item, PunchItemResponse)


@router.get(
    "/{project_id}/punch-items",
    response_model=PunchItemListResponse,
)
async def list_punch_items(
    project_id: uuid.UUID,
    status: str | None = Query(None, description="Filter by status: open|fixed|verified"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PunchItemListResponse:
    await get_owned_project_or_404(project_id, user, db)

    q = select(PunchItem).where(PunchItem.project_id == project_id)
    if status:
        q = q.where(PunchItem.status == status)
    items = (await db.execute(q.order_by(PunchItem.created_at))).scalars().all()
    return PunchItemListResponse(data=[PunchItemResponse.model_validate(i) for i in items], total=len(items))


@router.patch(
    "/{project_id}/punch-items/{item_id}",
    response_model=PunchItemResponse,
)
async def update_punch_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    body: PunchItemUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PunchItemResponse:
    await get_owned_project_or_404(project_id, user, db)
    item = await _get_item_or_404(project_id, item_id, db)

    if body.status is not None:
        _apply_resolved_at(item, body.status)
    apply_updates(item, body)

    return await commit_refresh_validate(db, item, PunchItemResponse)


@router.delete(
    "/{project_id}/punch-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_punch_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await get_owned_project_or_404(project_id, user, db)
    await db.delete(await _get_item_or_404(project_id, item_id, db))
    await db.commit()
