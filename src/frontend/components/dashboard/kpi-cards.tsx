import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, AlertCircle, TrendingUp, Users } from "lucide-react";
import { formatBudget } from "@/lib/projects";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardStats {
  activeProjects: number;
  overdueTasks: number;
  monthlyRevenueCents: number;
  staffUtilizationPct: number;
}

interface StaffMember {
  id: string;
  weekly_hours_target: number | null;
  active: boolean;
}

interface Assignment {
  staff_id: string;
  start_at: string;
  end_at: string;
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Compute staff utilization percentage for a given month (YYYY-MM).
 *
 * available hours = sum over active staff of (weekly_hours_target * (days_in_month / 7))
 * assigned hours  = sum of hours from assignments whose start_at falls in that month
 *
 * Returns an integer 0–100, capped at 100.
 */
export function computeStaffUtilization(
  staff: StaffMember[],
  assignments: Assignment[],
  month: string // "YYYY-MM"
): number {
  const activeStaff = staff.filter((s) => s.active);
  if (activeStaff.length === 0) return 0;

  // Available hours: sum of weekly_hours_target * (days_in_month / 7) per active staff member
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const weeksInMonth = daysInMonth / 7;

  const availableHours = activeStaff.reduce((sum, s) => {
    return sum + (s.weekly_hours_target ?? 0) * weeksInMonth;
  }, 0);

  if (availableHours <= 0) return 0;

  // Assigned hours: only assignments that start in the target month
  const assignedHours = assignments
    .filter((a) => a.start_at.slice(0, 7) === month)
    .reduce((sum, a) => {
      const start = new Date(a.start_at);
      const end = new Date(a.end_at);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return sum + Math.max(0, hours);
    }, 0);

  return Math.min(100, Math.round((assignedHours / availableHours) * 100));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface KpiCardsProps {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
}

export function KpiCards({ stats, loading, error }: KpiCardsProps) {
  if (loading) {
    return (
      <div
        data-testid="kpi-loading"
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
        data-testid="kpi-error"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (!stats) return null;

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
          <p className="text-2xl font-bold" data-testid="kpi-active-projects">
            {stats.activeProjects}
          </p>
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
          <p
            className="text-2xl font-bold"
            data-testid="kpi-overdue-tasks"
            style={stats.overdueTasks > 0 ? { color: "var(--destructive)" } : undefined}
          >
            {stats.overdueTasks}
          </p>
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
          <p className="text-2xl font-bold" data-testid="kpi-monthly-revenue">
            {formatBudget(stats.monthlyRevenueCents)}
          </p>
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
          <p className="text-2xl font-bold" data-testid="kpi-staff-utilization">
            {stats.staffUtilizationPct}%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
