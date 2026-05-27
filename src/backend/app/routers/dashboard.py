"""Dashboard stats router — aggregated KPIs for the current user."""

from datetime import datetime, timedelta, timezone

from app.core.database import get_db
from app.models.assignment import StaffAssignment
from app.models.invoice import Invoice
from app.models.project import Phase, Project, Task
from app.models.staff import Staff
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.dashboard import DashboardStatsResponse
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardStatsResponse:
    """Return aggregated dashboard KPIs for the current user."""
    now = datetime.now(timezone.utc)

    # --- Active projects ---
    active_projects_result = await db.execute(
        select(func.count(Project.id)).where(
            Project.owner_id == current_user.id,
            Project.status == "active",
            Project.deleted_at.is_(None),
        )
    )
    active_projects = active_projects_result.scalar() or 0

    # --- Overdue tasks (status != done, end_date < now, across user's projects) ---
    overdue_tasks_result = await db.execute(
        select(func.count(Task.id))
        .join(Phase, Task.phase_id == Phase.id)
        .join(Project, Phase.project_id == Project.id)
        .where(
            Project.owner_id == current_user.id,
            Project.deleted_at.is_(None),
            Task.status != "done",
            Task.end_date < now.date(),
        )
    )
    overdue_tasks = overdue_tasks_result.scalar() or 0

    # --- Monthly revenue (paid invoices, paid_at in current calendar month) ---
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Next month start
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)

    monthly_revenue_result = await db.execute(
        select(func.coalesce(func.sum(Invoice.total_cents), 0)).where(
            Invoice.owner_id == current_user.id,
            Invoice.status == "paid",
            Invoice.deleted_at.is_(None),
            Invoice.paid_at >= month_start,
            Invoice.paid_at < month_end,
        )
    )
    monthly_revenue_cents = monthly_revenue_result.scalar() or 0

    # --- Outstanding invoices (sent + overdue) ---
    outstanding_result = await db.execute(
        select(func.coalesce(func.sum(Invoice.total_cents), 0)).where(
            Invoice.owner_id == current_user.id,
            Invoice.status.in_(["sent", "overdue"]),
            Invoice.deleted_at.is_(None),
        )
    )
    outstanding_cents = outstanding_result.scalar() or 0

    # --- Staff utilization: this week's assignment hours / total weekly_hours_target ---
    # Week bounds: Monday 00:00 UTC to Sunday 23:59 UTC
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_end = week_start + timedelta(days=7)

    # Sum of weekly_hours_target for active staff
    target_result = await db.execute(
        select(func.coalesce(func.sum(Staff.weekly_hours_target), 0.0)).where(
            Staff.owner_id == current_user.id,
            Staff.active.is_(True),
            Staff.deleted_at.is_(None),
        )
    )
    total_target_hours: float = float(target_result.scalar() or 0.0)

    staff_utilization_pct = 0.0
    if total_target_hours > 0:
        # Sum assignment hours this week for active staff owned by user
        assigned_result = await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        # Duration in hours: (end_at - start_at) as seconds / 3600
                        # SQLite and PostgreSQL compatible via epoch subtraction
                        func.julianday(StaffAssignment.end_at) * 86400
                        - func.julianday(StaffAssignment.start_at) * 86400
                    ),
                    0.0,
                )
            )
            .join(Staff, StaffAssignment.staff_id == Staff.id)
            .where(
                Staff.owner_id == current_user.id,
                Staff.active.is_(True),
                Staff.deleted_at.is_(None),
                StaffAssignment.start_at >= week_start,
                StaffAssignment.start_at < week_end,
            )
        )
        assigned_seconds: float = float(assigned_result.scalar() or 0.0)
        assigned_hours = assigned_seconds / 3600.0
        staff_utilization_pct = round((assigned_hours / total_target_hours) * 100, 1)

    return DashboardStatsResponse(
        active_projects=active_projects,
        overdue_tasks=overdue_tasks,
        monthly_revenue_cents=monthly_revenue_cents,
        outstanding_cents=outstanding_cents,
        staff_utilization_pct=staff_utilization_pct,
    )
