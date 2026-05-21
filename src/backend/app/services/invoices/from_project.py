"""Build invoice line items from project tasks + materials."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.models.material import Material
from app.models.project import Phase, Project, Task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


@dataclass
class DraftLine:
    description: str
    quantity: float
    unit: str
    unit_price_cents: int
    vat_rate_bp: int


async def build_project_lines(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    owner_id: uuid.UUID,
    vat_rate_bp: int,
    include_materials: bool = True,
    include_labor: bool = True,
) -> tuple[Project, list[DraftLine]]:
    """Return the project (if owned by `owner_id`) and the synthesized line items.

    Raises LookupError when the project does not exist or is not owned.
    """
    project_res = await db.execute(
        select(Project)
        .where(
            Project.id == project_id,
            Project.owner_id == owner_id,
            Project.deleted_at.is_(None),
        )
        .options(selectinload(Project.phases).selectinload(Phase.tasks))
    )
    project = project_res.scalar_one_or_none()
    if project is None:
        raise LookupError("project not found")

    task_ids: list[uuid.UUID] = []
    tasks: list[Task] = []
    for phase in project.phases:
        for task in phase.tasks:
            tasks.append(task)
            task_ids.append(task.id)

    materials: list[Material] = []
    if include_materials and task_ids:
        mat_res = await db.execute(select(Material).where(Material.task_id.in_(task_ids)))
        materials = list(mat_res.scalars().all())

    lines: list[DraftLine] = []

    # Material lines — one per material entry (skip zero-priced).
    for mat in materials:
        if mat.unit_price_cents <= 0 or mat.quantity <= 0:
            continue
        lines.append(
            DraftLine(
                description=mat.name,
                quantity=float(mat.quantity),
                unit=mat.unit,
                unit_price_cents=int(mat.unit_price_cents),
                vat_rate_bp=vat_rate_bp,
            )
        )

    # Labor lines — one per task with non-zero labor cost.
    if include_labor:
        for task in tasks:
            if task.labor_cost_cents and task.labor_cost_cents > 0:
                lines.append(
                    DraftLine(
                        description=f"Arbeid — {task.name}",
                        quantity=1.0,
                        unit="service",
                        unit_price_cents=int(task.labor_cost_cents),
                        vat_rate_bp=vat_rate_bp,
                    )
                )

    return project, lines
