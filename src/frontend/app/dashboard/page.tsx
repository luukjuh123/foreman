"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, AlertCircle, TrendingUp, Receipt, Users } from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask } from "@/lib/types";
import { fetchWeekAgenda } from "@/lib/agenda";

const ONBOARDING_KEY = "foreman_onboarding_done";

/** Format an ISO date as Dutch dd-MM-yyyy. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

interface RecentProject {
  id: string;
  name: string;
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

  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
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

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Array<AgendaTask & { date: string }>>([]);
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

    const agendaFetch = fetchWeekAgenda().catch(() => null);

    Promise.all([
      listProjects(1, 100),
      apiFetch<InvoiceListData>("/invoices/?per_page=200"),
      apiFetch<StaffUtilization>("/staff/utilization"),
      agendaFetch,
    ])
      .then(async ([projectsRes, invoicesRes, utilizationRes]) => {
        if (!cancelled) {
          const invoices: InvoiceSummary[] = (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ?? [];
          const utilization: StaffUtilization = (utilizationRes as StaffUtilization) ?? {
            utilization_percent: 0,
            assigned_hours: 0,
            available_hours: 0,
          };
          setStats(computeStats(projectsRes.data, invoices, utilization));

          // Populate recent projects (sorted by updated_at desc, max 5)
          const sorted = [...projectsRes.data].sort((a, b) => {
            const ta = (a as RecentProject).updated_at ?? "";
            const tb = (b as RecentProject).updated_at ?? "";
            return tb.localeCompare(ta);
          });
          setRecentProjects(sorted.slice(0, 5));

          // Populate upcoming tasks from agenda
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welkom bij Foreman</h1>
        <p className="text-muted-foreground mt-1">
          Overzicht van uw constructiebedrijf
        </p>
      </div>

      {loading && (
        <div data-testid="dashboard-loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
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
      )}

      {error && (
        <div
          data-testid="dashboard-error"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Gegevens konden niet worden geladen: {error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Openstaande Facturen
                </CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="kpi-outstanding-invoices">
                  {formatBudget(stats.outstandingCents)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Personeelsbezetting
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="kpi-staff-utilization">
                  {stats.staffUtilization.utilization_percent}%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recente Activiteit</CardTitle>
              </CardHeader>
              <CardContent>
                {recentProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen recente activiteit.</p>
                ) : (
                  <ul className="space-y-2" data-testid="recent-activity-list">
                    {recentProjects.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[60%]">{p.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {p.updated_at ? formatDate(p.updated_at) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aankomende Taken</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen aankomende taken.</p>
                ) : (
                  <ul className="space-y-2" data-testid="upcoming-tasks-list">
                    {upcomingTasks.map((t) => (
                      <li key={`${t.task_id}-${t.date}`} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate max-w-[60%]">{t.name}</span>
                          <span className="text-muted-foreground text-xs">{formatDate(t.date)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{t.project_name}</p>
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
