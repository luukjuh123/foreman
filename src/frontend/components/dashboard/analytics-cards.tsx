import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FolderKanban,
  AlertCircle,
  TrendingUp,
  Users,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { formatBudget } from "@/lib/projects";
import type { DashboardAnalyticsResponse, Trend } from "@/lib/analytics";

// ─── Trend indicator ──────────────────────────────────────────────────────────

interface TrendBadgeProps {
  trend: Trend;
  testId: string;
}

function TrendBadge({ trend, testId }: TrendBadgeProps) {
  const icon =
    trend === "up" ? (
      <ArrowUp className="h-3 w-3" />
    ) : trend === "down" ? (
      <ArrowDown className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3" />
    );

  const colorClass =
    trend === "up"
      ? "text-green-600"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <span
      data-testid={testId}
      data-trend={trend}
      className={`flex items-center gap-0.5 text-xs font-medium ${colorClass}`}
    >
      {icon}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DashboardAnalyticsCardsProps {
  data: DashboardAnalyticsResponse | null;
  loading: boolean;
  error: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardAnalyticsCards({
  data,
  loading,
  error,
}: DashboardAnalyticsCardsProps) {
  if (loading) {
    return (
      <div
        data-testid="analytics-cards-loading"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="analytics-cards-error"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Active Projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Actieve Projecten
          </CardTitle>
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold" data-testid="kpi-active-projects">
              {data.active_projects}
            </p>
            <TrendBadge
              trend={data.active_projects_trend}
              testId="trend-active-projects"
            />
          </div>
        </CardContent>
      </Card>

      {/* Overdue Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Verlopen Taken
          </CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <p
              className="text-2xl font-bold"
              data-testid="kpi-overdue-tasks"
              style={
                data.overdue_tasks > 0
                  ? { color: "var(--destructive)" }
                  : undefined
              }
            >
              {data.overdue_tasks}
            </p>
            <TrendBadge
              trend={data.overdue_tasks_trend}
              testId="trend-overdue-tasks"
            />
          </div>
        </CardContent>
      </Card>

      {/* Monthly Revenue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Maandelijkse Omzet
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold" data-testid="kpi-monthly-revenue">
              {formatBudget(data.monthly_revenue_cents)}
            </p>
            <TrendBadge
              trend={data.monthly_revenue_trend}
              testId="trend-monthly-revenue"
            />
          </div>
        </CardContent>
      </Card>

      {/* Staff Utilization Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Personeel Bezettingsgraad
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <p
              className="text-2xl font-bold"
              data-testid="kpi-staff-utilization"
            >
              {data.staff_utilization_pct}%
            </p>
            <TrendBadge
              trend={data.staff_utilization_trend}
              testId="trend-staff-utilization"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
