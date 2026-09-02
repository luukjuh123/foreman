"""Subcontractor assignments router — link subcontractors to project phases/tasks."""

import uuid

from app.core.database import get_db
from app.models.subcontractor import SubcontractorAssignment
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.subcontractor import (
    AssignmentCreate,
    AssignmentListResponse,
    AssignmentResponse,
    AssignmentUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def _compute_total_cost(assignment: SubcontractorAssignment) -> int:
    """Compute total cost: fixed cost takes precedence over hourly rate."""
    if assignment.agreed_fixed_cost_cents is not None:
        return assignment.agreed_fixed_cost_cents
    actual = assignment.actual_hours or 0.0
    rate = assignment.agreed_rate_cents or 0
    return int(actual * rate)


async def _get_owned_assignment_or_404(
    assignment_id: uuid.UUID, user: User, db: AsyncSession
) -> SubcontractorAssignment:
    result = await db.execute(
        select(SubcontractorAssignment).where(
            SubcontractorAssignment.id == assignment_id,
            SubcontractorAssignment.owner_id == user.id,
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


@router.get("/", response_model=AssignmentListResponse)
async def list_assignments(
    project_id: uuid.UUID | None = Query(None),
    subcontractor_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentListResponse:
    base_query = select(SubcontractorAssignment).where(
        SubcontractorAssignment.owner_id == current_user.id,
    )
    if project_id:
        base_query = base_query.where(SubcontractorAssignment.project_id == project_id)
    if subcontractor_id:
        base_query = base_query.where(SubcontractorAssignment.subcontractor_id == subcontractor_id)

    count = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    offset = (page - 1) * per_page
    rows = (
        (await db.execute(base_query.order_by(SubcontractorAssignment.created_at.asc()).offset(offset).limit(per_page)))
        .scalars()
        .all()
    )
    return AssignmentListResponse(
        data=[AssignmentResponse.model_validate(r) for r in rows],
        total=count,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    assignment = SubcontractorAssignment(
        owner_id=current_user.id,
        subcontractor_id=body.subcontractor_id,
        project_id=body.project_id,
        phase_id=body.phase_id,
        task_id=body.task_id,
        description=body.description,
        estimated_hours=body.estimated_hours,
        agreed_rate_cents=body.agreed_rate_cents,
        agreed_fixed_cost_cents=body.agreed_fixed_cost_cents,
    )
    assignment.total_cost_cents = _compute_total_cost(assignment)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    assignment = await _get_owned_assignment_or_404(assignment_id, current_user, db)
    return AssignmentResponse.model_validate(assignment)


@router.put("/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: uuid.UUID,
    body: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    assignment = await _get_owned_assignment_or_404(assignment_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(assignment, field, value)
    assignment.total_cost_cents = _compute_total_cost(assignment)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    assignment = await _get_owned_assignment_or_404(assignment_id, current_user, db)
    await db.delete(assignment)
    await db.commit()
