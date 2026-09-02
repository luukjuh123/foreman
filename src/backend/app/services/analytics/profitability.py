"""Project profitability service.

Computes per-project margin:
    margin = invoice_revenue - labor_cost - material_cost

All monetary values are integer euro cents.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from app.models.invoice import Invoice
from app.models.material import Budget, BudgetItem
from app.models.project import Phase, Project, Task
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ProjectMarginData:
    project_id: uuid.UUID
    project_name: str
    revenue_cents: int
    labor_cost_cents: int
    material_cost_cents: int
    margin_cents: int
    margin_percentage: float


class ProfitabilityService:
    """Aggregates per-project revenue, labor cost, and material cost."""

    async def compute(
        self,
        owner_id: uuid.UUID,
        db: AsyncSession,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[ProjectMarginData]:
        # 1. Fetch all non-deleted projects for this owner.
        projects_result = await db.execute(
            select(Project).where(
                Project.owner_id == owner_id,
                Project.deleted_at.is_(None),
            )
        )
        projects = list(projects_result.scalars().all())
        if not projects:
            return []

        project_ids = [p.id for p in projects]

        # 2. Aggregate invoice revenue per project (subtotal_cents, date-filtered).
        invoice_q = select(
            Invoice.project_id,
            func.coalesce(func.sum(Invoice.subtotal_cents), 0).label("revenue"),
        ).where(
            Invoice.owner_id == owner_id,
            Invoice.project_id.in_(project_ids),
            Invoice.deleted_at.is_(None),
        )
        if start_date is not None:
            invoice_q = invoice_q.where(Invoice.issue_date >= start_date)
        if end_date is not None:
            invoice_q = invoice_q.where(Invoice.issue_date <= end_date)
        invoice_q = invoice_q.group_by(Invoice.project_id)
        invoice_result = await db.execute(invoice_q)
        revenue_by_project: dict[uuid.UUID, int] = {
            row.project_id: int(row.revenue) for row in invoice_result
        }

        # 3. Aggregate labor cost per project via tasks (sum labor_cost_cents).
        labor_q = (
            select(
                Phase.project_id,
                func.coalesce(func.sum(Task.labor_cost_cents), 0).label("labor"),
            )
            .join(Task, Task.phase_id == Phase.id)
            .where(Phase.project_id.in_(project_ids))
            .group_by(Phase.project_id)
        )
        labor_result = await db.execute(labor_q)
        labor_by_project: dict[uuid.UUID, int] = {
            row.project_id: int(row.labor) for row in labor_result
        }

        # 4. Aggregate material cost per project via BudgetItems (actual_cents).
        material_q = (
            select(
                Budget.project_id,
                func.coalesce(func.sum(BudgetItem.actual_cents), 0).label("materials"),
            )
            .join(BudgetItem, BudgetItem.budget_id == Budget.id)
            .where(
                Budget.project_id.in_(project_ids),
                BudgetItem.category == "materials",
            )
            .group_by(Budget.project_id)
        )
        material_result = await db.execute(material_q)
        material_by_project: dict[uuid.UUID, int] = {
            row.project_id: int(row.materials) for row in material_result
        }

        # 5. Compose result rows.
        rows: list[ProjectMarginData] = []
        for project in projects:
            revenue = revenue_by_project.get(project.id, 0)
            labor = labor_by_project.get(project.id, 0)
            materials = material_by_project.get(project.id, 0)
            margin = revenue - labor - materials
            pct = (margin / revenue * 100.0) if revenue > 0 else 0.0
            rows.append(
                ProjectMarginData(
                    project_id=project.id,
                    project_name=project.name,
                    revenue_cents=revenue,
                    labor_cost_cents=labor,
                    material_cost_cents=materials,
                    margin_cents=margin,
                    margin_percentage=round(pct, 2),
                )
            )

        return rows
