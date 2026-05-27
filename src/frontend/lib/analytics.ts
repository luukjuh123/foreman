import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

export type Trend = "up" | "down" | "neutral";

export interface DashboardAnalyticsResponse {
  active_projects: number;
  overdue_tasks: number;
  monthly_revenue_cents: number;
  staff_utilization_pct: number;
  active_projects_trend: Trend;
  overdue_tasks_trend: Trend;
  monthly_revenue_trend: Trend;
  staff_utilization_trend: Trend;
}

export async function fetchDashboardAnalytics(): Promise<DashboardAnalyticsResponse> {
  const token = getAccessToken() ?? undefined;
  return apiFetch<DashboardAnalyticsResponse>("/analytics/dashboard", { token });
}
