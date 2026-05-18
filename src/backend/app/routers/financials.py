"""Financials router — budget and cost tracking endpoints.

All monetary values are integer euro cents.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.material import Budget, BudgetItem
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.budget import (
    BudgetItemCreate,
    BudgetItemResponse,
    BudgetItemUpdate,
    BudgetResponse,
    BudgetUpsert,
)
from app.schemas.cost import (
    LaborCostResponse,
    MaterialCostResponse,
    MaterialLineResponse,
    TaskLaborResponse,
)
from app.services.financials.labor_cost import (
    DEFAULT_HOURLY_RATE_CENTS,
    LaborCostEstimator,
)
from app.services.financials.material_cost import (
    DefaultStorePriceProvider,
    MaterialCostAggregator,
    StorePriceProvider,
)

router = APIRouter()


def get_price_provider() -> StorePriceProvider:
    """Dependency hook so tests / Phase 12 can override the price source."""
    return DefaultStorePriceProvider()


async def _project_for_user_or_404(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project


async def _get_or_create_budget(project_id: uuid.UUID, db: AsyncSession) -> Budget:
    result = await db.execute(
        select(Budget)
        .where(Budget.project_id == project_id)
        .options(selectinload(Budget.items))
    )
    budget = result.scalar_one_or_none()
    if budget is not None:
        return budget
    budget = Budget(project_id=project_id)
    db.add(budget)
    await db.commit()
    result = await db.execute(
        select(Budget)
        .where(Budget.id == budget.id)
        .options(selectinload(Budget.items))
    )
    return result.scalar_one()


@router.get("/projects/{project_id}/budget", response_model=BudgetResponse)
async def get_budget(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    budget = await _get_or_create_budget(project_id, db)
    return BudgetResponse.model_validate(budget)


@router.put("/projects/{project_id}/budget", response_model=BudgetResponse)
async def upsert_budget(
    project_id: uuid.UUID,
    body: BudgetUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    budget = await _get_or_create_budget(project_id, db)
    budget.total_budget_cents = body.total_budget_cents
    budget.contingency_pct = body.contingency_pct
    await db.commit()
    result = await db.execute(
        select(Budget).where(Budget.id == budget.id).options(selectinload(Budget.items))
    )
    return BudgetResponse.model_validate(result.scalar_one())


@router.post(
    "/projects/{project_id}/budget/items",
    response_model=BudgetItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_budget_item(
    project_id: uuid.UUID,
    body: BudgetItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetItemResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    budget = await _get_or_create_budget(project_id, db)
    item = BudgetItem(
        budget_id=budget.id,
        category=body.category,
        name=body.name,
        description=body.description,
        estimated_cents=body.estimated_cents,
        actual_cents=body.actual_cents,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return BudgetItemResponse.model_validate(item)


async def _get_item_in_project_or_404(
    project_id: uuid.UUID, item_id: uuid.UUID, db: AsyncSession
) -> BudgetItem:
    result = await db.execute(
        select(BudgetItem)
        .join(Budget, BudgetItem.budget_id == Budget.id)
        .where(BudgetItem.id == item_id, Budget.project_id == project_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget item not found")
    return item


@router.put(
    "/projects/{project_id}/budget/items/{item_id}",
    response_model=BudgetItemResponse,
)
async def update_budget_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    body: BudgetItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetItemResponse:
    await _project_for_user_or_404(project_id, current_user, db)
    item = await _get_item_in_project_or_404(project_id, item_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return BudgetItemResponse.model_validate(item)


@router.delete(
    "/projects/{project_id}/budget/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_budget_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _project_for_user_or_404(project_id, current_user, db)
    item = await _get_item_in_project_or_404(project_id, item_id, db)
    await db.delete(item)
    await db.commit()


# ---------------------------------------------------------------------------
# Material cost aggregation
# ---------------------------------------------------------------------------


def _line_to_response(line) -> MaterialLineResponse:
    return MaterialLineResponse(
        material_id=line.material_id,
        name=line.name,
        quantity=line.quantity,
        unit=line.unit,
        unit_price_cents=line.unit_price_cents,
        total_cents=line.total_cents,
    )


@router.get(
    "/projects/{project_id}/material-cost",
    response_model=MaterialCostResponse,
)
async def get_material_cost(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    provider: StorePriceProvider = Depends(get_price_provider),
) -> MaterialCostResponse:
    """Aggregate the material cost for a project (sum of unit_price × quantity).

    Materials without a known price are returned under ``missing`` and are
    excluded from ``total_cents``. Source of prices is pluggable via
    ``StorePriceProvider``; Phase 12 will swap in live store integrations.
    """
    await _project_for_user_or_404(project_id, current_user, db)
    aggregator = MaterialCostAggregator(provider)
    report = await aggregator.aggregate(project_id, db)
    return MaterialCostResponse(
        total_cents=report.total_cents,
        items=[_line_to_response(item) for item in report.items],
        missing=[_line_to_response(item) for item in report.missing],
    )


# ---------------------------------------------------------------------------
# Labor cost estimation
# ---------------------------------------------------------------------------


@router.get(
    "/projects/{project_id}/labor-cost",
    response_model=LaborCostResponse,
)
async def get_labor_cost(
    project_id: uuid.UUID,
    hourly_rate_cents: int = Query(default=DEFAULT_HOURLY_RATE_CENTS, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LaborCostResponse:
    """Estimate labor cost = sum(task.estimated_hours) × hourly_rate_cents.

    The rate defaults to ``DEFAULT_HOURLY_RATE_CENTS`` (5000 ¢ = €50/hr) and
    can be overridden via query param to support what-if modelling on the
    financial dashboard without mutating per-task ``labor_cost_cents``.
    """
    await _project_for_user_or_404(project_id, current_user, db)
    estimator = LaborCostEstimator(hourly_rate_cents=hourly_rate_cents)
    report = await estimator.estimate(project_id, db)
    return LaborCostResponse(
        hourly_rate_cents=report.hourly_rate_cents,
        total_hours=report.total_hours,
        total_cents=report.total_cents,
        tasks=[
            TaskLaborResponse(
                task_id=t.task_id,
                name=t.name,
                estimated_hours=t.estimated_hours,
                cost_cents=t.cost_cents,
            )
            for t in report.tasks
        ],
    )
