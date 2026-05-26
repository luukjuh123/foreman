"""Analytics router — dashboard KPI metrics."""

from datetime import UTC, date, datetime, timedelta

from app.core.database import get_db
from app.models.assignment import StaffAssignment
from app.models.invoice import Invoice
from app.models.project import Phase, Project, Task
from app.models.staff import Staff
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.analytics import DashboardAnalyticsResponse
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/dashboard", response_model=DashboardAnalyticsResponse)
async def get_dashboard_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardAnalyticsResponse:
    """Return KPI metrics for the dashboard."""

    owner_id = current_user.id
    today = date.today()

    # --- Active projects ---
    active_projects_count: int = (
        await db.execute(
            select(func.count())
            .select_from(Project)
            .where(
                Project.owner_id == owner_id,
                Project.status == "active",
                Project.deleted_at.is_(None),
            )
        )
    ).scalar_one()

    # --- Overdue tasks ---
    # Tasks whose end_date < today and status != "done", in active projects
    overdue_tasks_count: int = (
        await db.execute(
            select(func.count())
            .select_from(Task)
            .join(Phase, Task.phase_id == Phase.id)
            .join(Project, Phase.project_id == Project.id)
            .where(
                Project.owner_id == owner_id,
                Project.deleted_at.is_(None),
                Task.end_date < today,
                Task.status != "done",
            )
        )
    ).scalar_one()

    # --- Monthly revenue (paid invoices this month) ---
    now = datetime.now(tz=UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    monthly_revenue_cents: int = (
        await db.execute(
            select(func.coalesce(func.sum(Invoice.total_cents), 0)).where(
                Invoice.owner_id == owner_id,
                Invoice.status == "paid",
                Invoice.paid_at >= month_start,
                Invoice.deleted_at.is_(None),
            )
        )
    ).scalar_one()

    # --- Staff utilization (% of active staff with an assignment this week) ---
    # Week = Mon 00:00 UTC through end of Sunday UTC
    weekday = today.weekday()  # 0 = Monday
    week_start_dt = datetime(today.year, today.month, today.day, tzinfo=UTC) - timedelta(days=weekday)
    week_end_dt = week_start_dt + timedelta(days=7)

    total_staff: int = (
        await db.execute(
            select(func.count())
            .select_from(Staff)
            .where(
                Staff.owner_id == owner_id,
                Staff.active.is_(True),
                Staff.deleted_at.is_(None),
            )
        )
    ).scalar_one()

    if total_staff == 0:
        staff_utilization_percent = 0.0
    else:
        # Count distinct staff with at least one assignment overlapping this week
        assigned_staff: int = (
            await db.execute(
                select(func.count(func.distinct(StaffAssignment.staff_id)))
                .join(Staff, StaffAssignment.staff_id == Staff.id)
                .where(
                    Staff.owner_id == owner_id,
                    Staff.active.is_(True),
                    Staff.deleted_at.is_(None),
                    StaffAssignment.start_at < week_end_dt,
                    StaffAssignment.end_at > week_start_dt,
                )
            )
        ).scalar_one()
        staff_utilization_percent = round((assigned_staff / total_staff) * 100, 1)

    return DashboardAnalyticsResponse(
        active_projects_count=active_projects_count,
        overdue_tasks_count=overdue_tasks_count,
        monthly_revenue_cents=monthly_revenue_cents,
        staff_utilization_percent=staff_utilization_percent,
    )
