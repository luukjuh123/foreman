"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  AlertCircle,
  TrendingUp,
  Receipt,
  Plus,
  ArrowUp,
  ArrowDown,
  Minus,
  CalendarClock,
  TriangleAlert,
  CircleCheck,
  Clock,
} from "lucide-react";
import { listProjects, formatBudget, formatDate } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask } from "@/lib/types";
import { fetchWeekAgenda, getProjectColor } from "@/lib/agenda";

const ONBOARDING_KEY = "foreman_onboarding_done";

// ── Dutch greeting helpers ────────────────────────────────────────────────────

function getDutchGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Goedemorgen";
  if (hour >= 12 && hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function getTodayDutch(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceSummary {
  id: string;
  status: "draft" | "sent" | "paid" | "overdue";
  total_cents: number;
  paid_at: string | null;
}

interface StaffUtilization {
  utilization_percent: number;
  assigned_hours: number;
  available_hours: number;
}

interface DashboardStats {
  activeProjects: number;
  overdueTasks: number;
  monthlyRevenueCents: number;
  outstandingCents: number;
  staffUtilization: StaffUtilization;
}

// ── Pure stat helpers ─────────────────────────────────────────────────────────

function isOverdue(task: { status: string; end_date?: string | null }): boolean {
  if (task.status === "done") return false;
  if (!task.end_date) return false;
  return new Date(task.end_date) < new Date();
}

function computeStats(
  projects: ProjectResponse[],
  invoices: InvoiceSummary[],
  staffUtilization: StaffUtilization,
): DashboardStats {
  const activeProjects = projects.filter((p) => p.status === "active").length;

  const overdueTasks = projects
    .flatMap((p) => p.phases ?? [])
    .flatMap((ph) => ph.tasks ?? [])
    .filter(isOverdue).length;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenueCents = invoices
    .filter(
      (inv) =>
        inv.status === "paid" &&
        inv.paid_at != null &&
        inv.paid_at.slice(0, 7) === thisMonth,
    )
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);

  const outstandingCents = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);

  return {
    activeProjects,
    overdueTasks,
    monthlyRevenueCents,
    outstandingCents,
    staffUtilization,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? ""}`} />
  );
}

type Trend = "up" | "down" | "neutral";

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend === "up") {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-green-600">
        <ArrowUp className="h-3 w-3" />
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-destructive">
        <ArrowDown className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
      <Minus className="h-3 w-3" />
    </span>
  );
}

// KPI card with icon accent strip, value, optional trend
interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent: string; // tailwind bg class for left accent strip
  testId: string;
  trend?: Trend;
  subtitle?: string;
}

function KpiCard({
  title,
  value,
  icon,
  accent,
  testId,
  trend,
  subtitle,
}: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      {/* Accent strip */}
      <div className={`absolute inset-y-0 left-0 w-1 ${accent} rounded-l-xl`} />
      <CardHeader className="flex flex-row items-center justify-between pb-1 pl-5">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent className="pl-5">
        <div className="flex items-end justify-between">
          <p className="text-2xl font-bold tabular-nums" data-testid={testId}>
            {value}
          </p>
          {trend !== undefined && <TrendBadge trend={trend} />}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Active project mini-card
function ActiveProjectCard({ project }: { project: ProjectResponse }) {
  const tasks = (project.phases ?? []).flatMap((ph) => ph.tasks ?? []);
  const done = tasks.filter((t) => t.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const budgetLabel = project.budget_cents
    ? formatBudget(project.budget_cents)
    : null;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      <Card className="group cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40 h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <Badge variant="default" className="shrink-0 text-xs">
              Actief
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Voortgang</span>
              <span className="text-xs font-medium">{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                data-testid="project-progress-bar"
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Budget */}
          {budgetLabel && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 shrink-0" />
              <span>Budget: {budgetLabel}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// Agenda task item for the Vandaag strip
function AgendaTaskItem({
  task,
}: {
  task: AgendaTask & { date: string };
}) {
  const color = getProjectColor(task.project_id);
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div
        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{task.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {task.project_name}
        </p>
      </div>
      {task.start_time && (
        <span className="shrink-0 text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {task.start_time}
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeProjects, setActiveProjects] = useState<ProjectResponse[]>([]);
  const [todayTasks, setTodayTasks] = useState<Array<AgendaTask & { date: string }>>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect first-time visitors to onboarding
  useEffect(() => {
    if (typeof window !== "undefined") {
      const done = localStorage.getItem(ONBOARDING_KEY);
      if (!done) {
        router.push("/dashboard/onboarding");
      }
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const today = new Date().toISOString().split("T")[0];

    Promise.all([
      listProjects(1, 100),
      apiFetch<{ data: { data: InvoiceSummary[] } }>("/invoices/?per_page=200"),
      apiFetch<StaffUtilization>("/staff/utilization"),
      fetchWeekAgenda().catch(() => null),
    ])
      .then(([projectsRes, invoicesRes, utilizationRes, agendaRes]) => {
        if (cancelled) return;

        const invoices: InvoiceSummary[] =
          (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ??
          [];
        const utilization: StaffUtilization = (utilizationRes as StaffUtilization) ?? {
          utilization_percent: 0,
          assigned_hours: 0,
          available_hours: 0,
        };

        setStats(computeStats(projectsRes.data, invoices, utilization));

        // Active projects only
        setActiveProjects(
          projectsRes.data.filter((p) => p.status === "active"),
        );

        // Overdue invoices for attention panel
        setOverdueInvoices(
          invoices.filter((inv) => inv.status === "overdue"),
        );

        // Today's agenda tasks
        if (agendaRes) {
          const todayDay = agendaRes.days.find((d) => d.date === today);
          if (todayDay) {
            setTodayTasks(
              todayDay.tasks
                .filter((t) => t.status !== "done")
                .map((t) => ({ ...t, date: today })),
            );
          }
        }

        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="space-y-6">
        {/* Greeting skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <SkeletonBox className="h-7 w-56" />
            <SkeletonBox className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <SkeletonBox className="h-9 w-32" />
            <SkeletonBox className="h-9 w-32" />
          </div>
        </div>
        {/* KPI skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <SkeletonBox className="h-3 w-24" />
              </CardHeader>
              <CardContent>
                <SkeletonBox className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Projects skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <SkeletonBox className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-2">
                <SkeletonBox className="h-1.5 w-full" />
                <SkeletonBox className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div
        data-testid="dashboard-error"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        Gegevens konden niet worden geladen: {error}
      </div>
    );
  }

  // ── Loaded ──────────────────────────────────────────────────────────────────

  const needsAttention =
    overdueInvoices.length > 0 ||
    (stats?.overdueTasks ?? 0) > 0;

  return (
    <div className="space-y-8">
      {/* ── Greeting header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getDutchGreeting()}
          </h1>
          <p
            className="text-sm text-muted-foreground mt-0.5"
            data-testid="greeting-date"
          >
            {getTodayDutch()}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/projects/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
            Nieuw project
          </Link>
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Receipt className="h-4 w-4" />
            Nieuwe factuur
          </Link>
        </div>
      </div>

      {/* ── KPI row ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            title="Actieve projecten"
            value={stats.activeProjects}
            icon={<FolderKanban className="h-4 w-4" />}
            accent="bg-blue-500"
            testId="kpi-active-projects"
            trend="neutral"
          />
          <KpiCard
            title="Openstaande facturen"
            value={formatBudget(stats.outstandingCents)}
            icon={<Receipt className="h-4 w-4" />}
            accent="bg-amber-500"
            testId="kpi-outstanding-invoices"
            trend={stats.outstandingCents > 0 ? "up" : "neutral"}
          />
          <KpiCard
            title="Omzet deze maand"
            value={formatBudget(stats.monthlyRevenueCents)}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="bg-green-500"
            testId="kpi-monthly-revenue"
            trend={stats.monthlyRevenueCents > 0 ? "up" : "neutral"}
          />
          <KpiCard
            title="Achterstallige taken"
            value={stats.overdueTasks}
            icon={<AlertCircle className="h-4 w-4" />}
            accent={stats.overdueTasks > 0 ? "bg-destructive" : "bg-muted"}
            testId="kpi-overdue-tasks"
            trend={
              stats.overdueTasks > 0
                ? "down"
                : "neutral"
            }
          />
        </div>
      )}

      {/* ── Main grid: projects + sidebar ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Actieve projecten (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Actieve projecten</h2>
            <Link
              href="/dashboard/projects"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Alle projecten →
            </Link>
          </div>

          {activeProjects.length === 0 ? (
            <Card
              data-testid="empty-active-projects"
              className="border-dashed"
            >
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <FolderKanban className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  Geen actieve projecten
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Start een nieuw project om uw dashboard te vullen.
                </p>
                <Link
                  href="/dashboard/projects/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Nieuw project
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {activeProjects.slice(0, 6).map((p) => (
                <ActiveProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Vandaag + Aandacht nodig (1/3 width) */}
        <div className="space-y-6">
          {/* Vandaag agenda strip */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Vandaag
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayTasks.length === 0 ? (
                <div
                  data-testid="empty-today-agenda"
                  className="flex flex-col items-center py-4 text-center"
                >
                  <CircleCheck className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Geen taken gepland voor vandaag
                  </p>
                  <Link
                    href="/dashboard/agenda"
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Naar agenda →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {todayTasks.slice(0, 6).map((t) => (
                    <AgendaTaskItem key={`${t.task_id}-${t.date}`} task={t} />
                  ))}
                  {todayTasks.length > 6 && (
                    <p className="pt-2 text-center text-xs text-muted-foreground">
                      +{todayTasks.length - 6} meer taken
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Aandacht nodig */}
          <Card data-testid="attention-panel">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="h-4 w-4 text-amber-500" />
                Aandacht nodig
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!needsAttention ? (
                <div
                  data-testid="attention-all-clear"
                  className="flex flex-col items-center py-4 text-center"
                >
                  <CircleCheck className="h-8 w-8 text-green-500/60 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Alles ziet er goed uit
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Overdue invoices */}
                  {overdueInvoices.length > 0 && (
                    <div className="rounded-lg bg-destructive/10 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-destructive flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5" />
                          Verlopen facturen
                        </span>
                        <span
                          className="text-xs font-bold text-destructive"
                          data-testid="overdue-invoices-count"
                        >
                          {overdueInvoices.length}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBudget(
                          overdueInvoices.reduce(
                            (s, i) => s + i.total_cents,
                            0,
                          ),
                        )}{" "}
                        openstaand
                      </p>
                      <Link
                        href="/dashboard/invoices?status=overdue"
                        className="mt-1.5 block text-xs text-destructive hover:underline"
                      >
                        Bekijk facturen →
                      </Link>
                    </div>
                  )}

                  {/* Overdue tasks */}
                  {stats && stats.overdueTasks > 0 && (
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Achterstallige taken
                        </span>
                        <span className="text-xs font-bold text-amber-600">
                          {stats.overdueTasks}
                        </span>
                      </div>
                      <Link
                        href="/dashboard/projects"
                        className="mt-1.5 block text-xs text-amber-600 hover:underline"
                      >
                        Bekijk projecten →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
