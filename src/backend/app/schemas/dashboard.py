"""Pydantic schemas for dashboard stats."""

from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    active_projects: int
    overdue_tasks: int
    monthly_revenue_cents: int
    outstanding_cents: int
    staff_utilization_pct: float
