"""Analytics router — cross-project reporting endpoints."""

from __future__ import annotations

from datetime import date as _date

from app.core.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.profitability import ProjectMargin
from app.services.analytics.profitability import ProfitabilityService
from fastapi import APIRouter, Depends
from fastapi import Query as _Query
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/profitability", response_model=list[ProjectMargin])
async def get_profitability(
    start_date: _date | None = _Query(default=None, description="Period start (inclusive, ISO 8601)"),
    end_date: _date | None = _Query(default=None, description="Period end (inclusive, ISO 8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectMargin]:
    """Return per-project profitability: revenue minus labor and material costs.

    All monetary values are in euro cents. Optionally filtered by invoice
    issue_date within [start_date, end_date].
    """
    svc = ProfitabilityService()
    results = await svc.compute(
        owner_id=current_user.id,
        db=db,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        ProjectMargin(
            project_id=r.project_id,
            project_name=r.project_name,
            revenue_cents=r.revenue_cents,
            labor_cost_cents=r.labor_cost_cents,
            material_cost_cents=r.material_cost_cents,
            margin_cents=r.margin_cents,
            margin_percentage=r.margin_percentage,
        )
        for r in results
    ]
