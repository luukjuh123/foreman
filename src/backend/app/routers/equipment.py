"""Equipment router — CRUD + project assignment."""

import uuid

from app.core.database import get_db
from app.models.equipment import Equipment, EquipmentAssignment
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.equipment import (
    EquipmentAssignmentCreate,
    EquipmentAssignmentResponse,
    EquipmentCreate,
    EquipmentListResponse,
    EquipmentResponse,
    EquipmentUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_equipment_or_404(equipment_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> Equipment:
    result = await db.execute(
        select(Equipment)
        .where(Equipment.id == equipment_id, Equipment.owner_id == owner_id)
        .options(selectinload(Equipment.assignments))
    )
    equipment = result.scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
    return equipment


async def _get_project_or_404_for_owner(project_id: uuid.UUID, owner_id: uuid.UUID, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == owner_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


# ---------------------------------------------------------------------------
# Equipment endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=EquipmentListResponse)
async def list_equipment(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    category: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentListResponse:
    filters = [Equipment.owner_id == current_user.id]
    if status is not None:
        filters.append(Equipment.status == status)
    if category is not None:
        filters.append(Equipment.category == category)

    count_result = await db.execute(
        select(func.count()).select_from(Equipment).where(*filters)
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Equipment)
        .where(*filters)
        .options(selectinload(Equipment.assignments))
        .offset(offset)
        .limit(per_page)
    )
    items = result.scalars().all()

    return EquipmentListResponse(
        data=[EquipmentResponse.model_validate(e) for e in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/", response_model=EquipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_equipment(
    body: EquipmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentResponse:
    equipment = Equipment(
        owner_id=current_user.id,
        name=body.name,
        category=body.category,
        status=body.status,
        serial_number=body.serial_number,
        purchase_date=body.purchase_date,
        purchase_price_cents=body.purchase_price_cents,
        daily_rental_cost_cents=body.daily_rental_cost_cents,
        notes=body.notes,
    )
    db.add(equipment)
    await db.commit()
    await db.refresh(equipment)
    result = await db.execute(
        select(Equipment).where(Equipment.id == equipment.id).options(selectinload(Equipment.assignments))
    )
    return EquipmentResponse.model_validate(result.scalar_one())


@router.get("/{equipment_id}", response_model=EquipmentResponse)
async def get_equipment(
    equipment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentResponse:
    equipment = await _get_equipment_or_404(equipment_id, current_user.id, db)
    return EquipmentResponse.model_validate(equipment)


@router.put("/{equipment_id}", response_model=EquipmentResponse)
async def update_equipment(
    equipment_id: uuid.UUID,
    body: EquipmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentResponse:
    equipment = await _get_equipment_or_404(equipment_id, current_user.id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(equipment, field, value)

    await db.commit()
    await db.refresh(equipment)
    result = await db.execute(
        select(Equipment).where(Equipment.id == equipment.id).options(selectinload(Equipment.assignments))
    )
    return EquipmentResponse.model_validate(result.scalar_one())


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_equipment(
    equipment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    equipment = await _get_equipment_or_404(equipment_id, current_user.id, db)
    await db.delete(equipment)
    await db.commit()


# ---------------------------------------------------------------------------
# Assignment endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{equipment_id}/assignments",
    response_model=EquipmentAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_equipment(
    equipment_id: uuid.UUID,
    body: EquipmentAssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentAssignmentResponse:
    await _get_equipment_or_404(equipment_id, current_user.id, db)
    await _get_project_or_404_for_owner(body.project_id, current_user.id, db)

    assignment = EquipmentAssignment(
        equipment_id=equipment_id,
        project_id=body.project_id,
        assigned_date=body.assigned_date,
        returned_date=body.returned_date,
        notes=body.notes,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return EquipmentAssignmentResponse.model_validate(assignment)


@router.delete(
    "/{equipment_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unassign_equipment(
    equipment_id: uuid.UUID,
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Verify equipment ownership first
    await _get_equipment_or_404(equipment_id, current_user.id, db)

    result = await db.execute(
        select(EquipmentAssignment).where(
            EquipmentAssignment.id == assignment_id,
            EquipmentAssignment.equipment_id == equipment_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    await db.delete(assignment)
    await db.commit()
