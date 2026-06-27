"""Equipment/tool tracking router — Phase 19.

Endpoints:
  CRUD:        /api/v1/equipment/
  Assignments: /api/v1/equipment/{id}/assignments
  Maintenance: /api/v1/equipment/{id}/maintenance
  Upcoming:    /api/v1/equipment/maintenance/upcoming
"""

import uuid
from datetime import UTC, date, datetime

from app.core.database import get_db
from app.models.equipment import Equipment, EquipmentAssignment, EquipmentMaintenance
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.equipment import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    EquipmentCreate,
    EquipmentListResponse,
    EquipmentResponse,
    EquipmentUpdate,
    MaintenanceCreate,
    MaintenanceResponse,
)
from app.routers.deps import apply_updates, count_query, get_or_404
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def _get_owned_equipment_or_404(eq_id: uuid.UUID, user: User, db: AsyncSession) -> Equipment:
    return await get_or_404(
        db, Equipment,
        Equipment.id == eq_id, Equipment.owner_id == user.id, Equipment.deleted_at.is_(None),
    )


# ---------------------------------------------------------------------------
# Equipment CRUD
# ---------------------------------------------------------------------------


@router.get("/", response_model=EquipmentListResponse)
async def list_equipment(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentListResponse:
    where = (Equipment.owner_id == current_user.id, Equipment.deleted_at.is_(None))
    count = (await db.execute(select(func.count()).select_from(Equipment).where(*where))).scalar_one()
    rows = (await db.execute(
        select(Equipment).where(*where).order_by(Equipment.created_at.asc()).offset((page - 1) * per_page).limit(per_page)
    )).scalars().all()
    return EquipmentListResponse(data=[EquipmentResponse.model_validate(e) for e in rows], total=count, page=page, per_page=per_page)


@router.post("/", response_model=EquipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_equipment(
    body: EquipmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentResponse:
    eq = Equipment(owner_id=current_user.id, **body.model_dump())
    db.add(eq)
    await db.commit()
    await db.refresh(eq)
    return EquipmentResponse.model_validate(eq)


# NOTE: /maintenance/upcoming must be defined BEFORE /{eq_id} to avoid
# "upcoming" being interpreted as a UUID.
@router.get("/maintenance/upcoming", response_model=list[MaintenanceResponse])
async def list_upcoming_maintenance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MaintenanceResponse]:
    """Return maintenance records with a next_due_date in the future, for equipment owned by current user."""
    rows = (await db.execute(
        select(EquipmentMaintenance)
        .join(Equipment, EquipmentMaintenance.equipment_id == Equipment.id)
        .where(Equipment.owner_id == current_user.id, Equipment.deleted_at.is_(None),
               EquipmentMaintenance.next_due_date.is_not(None), EquipmentMaintenance.next_due_date > date.today())
        .order_by(EquipmentMaintenance.next_due_date.asc())
    )).scalars().all()
    return [MaintenanceResponse.model_validate(r) for r in rows]


@router.get("/{eq_id}", response_model=EquipmentResponse)
async def get_equipment(
    eq_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentResponse:
    eq = await _get_owned_equipment_or_404(eq_id, current_user, db)
    return EquipmentResponse.model_validate(eq)


@router.put("/{eq_id}", response_model=EquipmentResponse)
async def update_equipment(
    eq_id: uuid.UUID,
    body: EquipmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EquipmentResponse:
    eq = await _get_owned_equipment_or_404(eq_id, current_user, db)
    apply_updates(eq, body)
    await db.commit()
    await db.refresh(eq)
    return EquipmentResponse.model_validate(eq)


@router.delete("/{eq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_equipment(
    eq_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    eq = await _get_owned_equipment_or_404(eq_id, current_user, db)
    eq.deleted_at = datetime.now(UTC)
    await db.commit()


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


@router.post(
    "/{eq_id}/assignments",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_to_project(
    eq_id: uuid.UUID,
    body: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    await _get_owned_equipment_or_404(eq_id, current_user, db)
    assignment = EquipmentAssignment(equipment_id=eq_id, **body.model_dump())
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


@router.get("/{eq_id}/assignments", response_model=list[AssignmentResponse])
async def list_assignments(
    eq_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssignmentResponse]:
    await _get_owned_equipment_or_404(eq_id, current_user, db)
    rows = (await db.execute(
        select(EquipmentAssignment).where(EquipmentAssignment.equipment_id == eq_id).order_by(EquipmentAssignment.assigned_date.asc())
    )).scalars().all()
    return [AssignmentResponse.model_validate(r) for r in rows]


@router.patch("/{eq_id}/assignments/{assignment_id}", response_model=AssignmentResponse)
async def release_equipment(
    eq_id: uuid.UUID,
    assignment_id: uuid.UUID,
    body: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    await _get_owned_equipment_or_404(eq_id, current_user, db)
    assignment = await get_or_404(
        db, EquipmentAssignment,
        EquipmentAssignment.id == assignment_id, EquipmentAssignment.equipment_id == eq_id,
    )
    apply_updates(assignment, body)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------


@router.post(
    "/{eq_id}/maintenance",
    response_model=MaintenanceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def log_maintenance(
    eq_id: uuid.UUID,
    body: MaintenanceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MaintenanceResponse:
    await _get_owned_equipment_or_404(eq_id, current_user, db)
    record = EquipmentMaintenance(equipment_id=eq_id, **body.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return MaintenanceResponse.model_validate(record)


@router.get("/{eq_id}/maintenance", response_model=list[MaintenanceResponse])
async def list_maintenance(
    eq_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MaintenanceResponse]:
    await _get_owned_equipment_or_404(eq_id, current_user, db)
    rows = (await db.execute(
        select(EquipmentMaintenance).where(EquipmentMaintenance.equipment_id == eq_id).order_by(EquipmentMaintenance.maintenance_date.asc())
    )).scalars().all()
    return [MaintenanceResponse.model_validate(r) for r in rows]
