"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  AlertCircle,
  TrendingUp,
  Receipt,
  Users,
  Plus,
  FileText,
  Calendar,
  ArrowRight,
  Clock,
  ClipboardList,
  CheckCircle2,
  Send,
} from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask } from "@/lib/types";
import { fetchWeekAgenda } from "@/lib/agenda";

const ONBOARDING_KEY = "foreman_onboarding_done";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

interface RecentProject {
  id: string;
  name: string;
  status: string;
  updated_at?: string | null;
}

interface InvoiceSummary {
  id: string;
  status: "draft" | "sent" | "paid" | "overdue";
  total_cents: number;
  paid_at: string | null;
}

interface InvoiceListData {
  data: InvoiceSummary[];
  total: number;
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
        inv.paid_at.slice(0, 7) === thisMonth
    )
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);
  const outstandingCents = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0);
  return { activeProjects, overdueTasks, monthlyRevenueCents, outstandingCents, staffUtilization };
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-gray-400",
  completed: "bg-blue-500",
  archived: "bg-gray-300",
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  subtitle?: string;
  testId?: string;
}

function KpiCard({ title, value, icon: Icon, accent, subtitle, testId }: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}/10`}>
          <Icon className={`h-5 w-5 ${accent.replace("bg-", "text-")}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight" data-testid={testId}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline — horizontal connected steps
// ---------------------------------------------------------------------------

interface PipelineData {
  quotesOpen: number;
  quoteValueCents: number;
  projectsActive: number;
  projectValueCents: number;
  invoicedCents: number;
  paidCents: number;
}

function PipelineHorizontal({ data }: { data: PipelineData }) {
  const steps = [
    {
      label: "Offertes",
      sublabel: `${data.quotesOpen} openstaand`,
      value: formatBudget(data.quoteValueCents),
      icon: ClipboardList,
      color: "bg-blue-500",
      lightBg: "bg-blue-500/10",
      textColor: "text-blue-600 dark:text-blue-400",
      borderColor: "border-blue-500/30",
    },
    {
      label: "Projecten",
      sublabel: `${data.projectsActive} actief`,
      value: formatBudget(data.projectValueCents),
      icon: FolderKanban,
      color: "bg-primary",
      lightBg: "bg-primary/10",
      textColor: "text-primary",
      borderColor: "border-primary/30",
    },
    {
      label: "Gefactureerd",
      sublabel: "totaal verzonden",
      value: formatBudget(data.invoicedCents),
      icon: Send,
      color: "bg-amber-500",
      lightBg: "bg-amber-500/10",
      textColor: "text-amber-600 dark:text-amber-400",
      borderColor: "border-amber-500/30",
    },
    {
      label: "Ontvangen",
      sublabel: "betaald",
      value: formatBudget(data.paidCents),
      icon: CheckCircle2,
      color: "bg-emerald-500",
      lightBg: "bg-emerald-500/10",
      textColor: "text-emerald-600 dark:text-emerald-400",
      borderColor: "border-emerald-500/30",
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Pipeline</CardTitle>
        <Link href="/dashboard/quotes">
          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
            Offertes bekijken
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {/* Desktop: horizontal flow */}
        <div className="hidden sm:grid sm:grid-cols-4 gap-0">
          {steps.map((step, i) => (
            <div key={step.label} className="relative flex flex-col items-center text-center">
              {/* Connector line */}
              {i > 0 && (
                <div className="absolute left-0 top-7 w-1/2 h-px bg-border" />
              )}
              {i < steps.length - 1 && (
                <div className="absolute right-0 top-7 w-1/2 h-px bg-border" />
              )}
              {/* Icon circle */}
              <div className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border-2 ${step.borderColor} ${step.lightBg} mb-3`}>
                <step.icon className={`h-6 w-6 ${step.textColor}`} />
              </div>
              {/* Value */}
              <p className="text-lg font-bold tracking-tight">{step.value}</p>
              {/* Label */}
              <p className="text-xs font-medium text-foreground mt-0.5">{step.label}</p>
              <p className="text-[10px] text-muted-foreground">{step.sublabel}</p>
            </div>
          ))}
        </div>

        {/* Mobile: vertical stack */}
        <div className="sm:hidden space-y-3">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.lightBg}`}>
                <step.icon className={`h-5 w-5 ${step.textColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{step.label}</span>
                  <span className="text-sm font-bold">{step.value}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{step.sublabel}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Array<AgendaTask & { date: string }>>([]);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const agendaFetch = fetchWeekAgenda().catch(() => null);
    const quotesFetch = apiFetch<{ data: Array<{ status: string; total_cents: number }> }>("/quotes/?per_page=200").catch(() => ({ data: [] }));

    Promise.all([
      listProjects(1, 100),
      apiFetch<InvoiceListData>("/invoices/?per_page=200"),
      apiFetch<StaffUtilization>("/staff/utilization"),
      agendaFetch,
      quotesFetch,
    ])
      .then(async ([projectsRes, invoicesRes, utilizationRes, _agenda, quotesRes]) => {
        if (!cancelled) {
          const invoices: InvoiceSummary[] = (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ?? [];
          const utilization: StaffUtilization = (utilizationRes as StaffUtilization) ?? {
            utilization_percent: 0,
            assigned_hours: 0,
            available_hours: 0,
          };
          setStats(computeStats(projectsRes.data, invoices, utilization));

          const sorted = [...projectsRes.data].sort((a, b) => {
            const ta = (a as RecentProject).updated_at ?? "";
            const tb = (b as RecentProject).updated_at ?? "";
            return tb.localeCompare(ta);
          });
          setRecentProjects(sorted.slice(0, 5));

          // Pipeline data
          const quotes = (quotesRes as { data: Array<{ status: string; total_cents: number }> }).data ?? [];
          const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
          const activeProjects = projectsRes.data.filter((p) => p.status === "active");
          setPipeline({
            quotesOpen: openQuotes.length,
            quoteValueCents: openQuotes.reduce((s, q) => s + q.total_cents, 0),
            projectsActive: activeProjects.length,
            projectValueCents: activeProjects.reduce((s, p) => s + (p.budget_cents ?? 0), 0),
            invoicedCents: invoices.reduce((s, i) => s + (i.total_cents ?? 0), 0),
            paidCents: invoices
              .filter((i) => i.status === "paid")
              .reduce((s, i) => s + (i.total_cents ?? 0), 0),
          });

          const agenda = await agendaFetch;
          if (!cancelled && agenda) {
            const tasks: Array<AgendaTask & { date: string }> = [];
            for (const day of agenda.days) {
              for (const task of day.tasks) {
                if (task.status !== "done") {
                  tasks.push({ ...task, date: day.date });
                }
              }
            }
            setUpcomingTasks(tasks);
          }

          setLoading(false);
        }
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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Goedemorgen";
    if (h < 18) return "Goedemiddag";
    return "Goedenavond";
  })();

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 px-6 py-6 md:px-8 md:py-7">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-foreground">
              {greeting}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Beheer uw projecten, offertes en facturen vanuit een overzicht.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/dashboard/projects/new">
              <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/20">
                <Plus className="h-4 w-4" />
                Nieuw project
              </Button>
            </Link>
            <Link href="/dashboard/quotes/new">
              <Button size="sm" variant="outline" className="gap-1.5">
                <ClipboardList className="h-4 w-4" />
                Offerte
              </Button>
            </Link>
            <Link href="/dashboard/invoices/new">
              <Button size="sm" variant="outline" className="gap-1.5">
                <FileText className="h-4 w-4" />
                Factuur
              </Button>
            </Link>
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/[0.04]" />
        <div className="absolute -right-4 top-14 h-28 w-28 rounded-full bg-primary/[0.03]" />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div data-testid="dashboard-loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i} className="relative overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 bg-muted animate-pulse" />
              <CardContent className="p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted mb-3" />
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          data-testid="dashboard-error"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Gegevens konden niet worden geladen: {error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              title="Actieve Projecten"
              value={stats.activeProjects}
              icon={FolderKanban}
              accent="bg-primary"
              testId="kpi-active-projects"
            />
            <KpiCard
              title="Verlopen Taken"
              value={stats.overdueTasks}
              icon={AlertCircle}
              accent={stats.overdueTasks > 0 ? "bg-destructive" : "bg-emerald-500"}
              testId="kpi-overdue-tasks"
            />
            <KpiCard
              title="Omzet deze maand"
              value={formatBudget(stats.monthlyRevenueCents)}
              icon={TrendingUp}
              accent="bg-emerald-500"
              testId="kpi-monthly-revenue"
            />
            <KpiCard
              title="Openstaand"
              value={formatBudget(stats.outstandingCents)}
              icon={Receipt}
              accent="bg-amber-500"
              testId="kpi-outstanding-invoices"
            />
            <KpiCard
              title="Bezetting"
              value={`${stats.staffUtilization.utilization_percent}%`}
              icon={Users}
              accent="bg-blue-500"
              testId="kpi-staff-utilization"
              subtitle={`${stats.staffUtilization.assigned_hours}/${stats.staffUtilization.available_hours} uur`}
            />
          </div>

          {/* Pipeline */}
          {pipeline && <PipelineHorizontal data={pipeline} />}

          {/* Content grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent Projects */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold">Recente Projecten</CardTitle>
                <Link href="/dashboard/projects">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                    Alles bekijken
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FolderKanban className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Nog geen projecten.</p>
                    <Link href="/dashboard/projects/new">
                      <Button size="sm" variant="outline" className="mt-3 gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Eerste project aanmaken
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-0.5" data-testid="recent-activity-list">
                    {recentProjects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/dashboard/projects/${p.id}`}
                          className="flex items-center justify-between rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[p.status] ?? "bg-gray-400"}`} />
                            <span className="font-medium text-sm truncate">{p.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 ml-3">
                            {p.updated_at ? formatDate(p.updated_at) : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Tasks */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold">Aankomende Taken</CardTitle>
                <Link href="/dashboard/agenda">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                    Agenda openen
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {upcomingTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Calendar className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Geen aankomende taken.</p>
                  </div>
                ) : (
                  <ul className="space-y-0.5" data-testid="upcoming-tasks-list">
                    {upcomingTasks.slice(0, 6).map((t) => (
                      <li
                        key={`${t.task_id}-${t.date}`}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{t.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatDate(t.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{t.project_name}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
