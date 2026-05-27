"""Analytics schemas — dashboard KPI response."""

from pydantic import BaseModel


class DashboardAnalyticsResponse(BaseModel):
    """Aggregated KPI metrics for the dashboard."""

    active_projects_count: int
    overdue_tasks_count: int
    monthly_revenue_cents: int
    staff_utilization_percent: float
