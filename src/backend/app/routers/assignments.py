"""Staff assignments router — schedule staff onto projects/tasks without overlap."""

import uuid

from app.core.database import get_db
from app.models.assignment import StaffAssignment
from app.models.staff import Staff
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.assignment import StaffAssignmentCreate, StaffAssignmentResponse
from app.routers.deps import add_commit_refresh_validate, get_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_owned_staff(staff_id: uuid.UUID, user: User, db: AsyncSession) -> Staff:
    return await get_or_404(
        db, Staff,
        Staff.id == staff_id, Staff.owner_id == user.id, Staff.deleted_at.is_(None),
    )


async def _get_owned_assignment_or_404(assignment_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> StaffAssignment:
    a = (await db.execute(
        select(StaffAssignment).join(Staff, StaffAssignment.staff_id == Staff.id)
        .where(StaffAssignment.id == assignment_id, Staff.owner_id == owner_id)
    )).scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return a


async def _find_overlap(db: AsyncSession, staff_id: uuid.UUID, start_at, end_at) -> StaffAssignment | None:
    return (await db.execute(
        select(StaffAssignment).where(
            StaffAssignment.staff_id == staff_id, StaffAssignment.start_at < end_at, StaffAssignment.end_at > start_at,
        )
    )).scalars().first()


@router.post("/", response_model=StaffAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: StaffAssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffAssignmentResponse:
    await _get_owned_staff(body.staff_id, current_user, db)
    conflict = await _find_overlap(db, body.staff_id, body.start_at, body.end_at)
    if conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Assignment overlaps existing assignment {conflict.id}",
        )
    return await add_commit_refresh_validate(db, StaffAssignment(**body.model_dump()), StaffAssignmentResponse)


@router.get("/", response_model=list[StaffAssignmentResponse])
async def list_assignments(
    staff_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[StaffAssignmentResponse]:
    stmt = (
        select(StaffAssignment)
        .join(Staff, StaffAssignment.staff_id == Staff.id)
        .where(Staff.owner_id == current_user.id)
        .order_by(StaffAssignment.start_at)
    )
    if staff_id is not None:
        stmt = stmt.where(StaffAssignment.staff_id == staff_id)
    if project_id is not None:
        stmt = stmt.where(StaffAssignment.project_id == project_id)
    result = await db.execute(stmt)
    return [StaffAssignmentResponse.model_validate(a) for a in result.scalars().all()]


@router.get("/{assignment_id}", response_model=StaffAssignmentResponse)
async def get_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffAssignmentResponse:
    return StaffAssignmentResponse.model_validate(await _get_owned_assignment_or_404(assignment_id, current_user.id, db))


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.delete(await _get_owned_assignment_or_404(assignment_id, current_user.id, db))
    await db.commit()
