"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjects } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask, AgendaDayResponse } from "@/lib/types";
import { KpiCards, computeStaffUtilization, type DashboardStats } from "@/components/dashboard/kpi-cards";
import { fetchWeekAgenda } from "@/lib/agenda";

const ONBOARDING_KEY = "foreman_onboarding_done";

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


interface RecentProject {
  id: string;
  name: string;
  updated_at: string | null;
  status: string;
}

function isOverdue(task: { status: string; end_date?: string | null }): boolean {
  if (task.status === "done") return false;
  if (!task.end_date) return false;
  return new Date(task.end_date) < new Date();
}

function computeStats(
  projects: ProjectResponse[],
  invoices: InvoiceSummary[],
  staff: StaffMember[],
  assignments: Assignment[]
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

  const staffUtilizationPct = computeStaffUtilization(staff, assignments, thisMonth);

  return { activeProjects, overdueTasks, monthlyRevenueCents, staffUtilizationPct };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
      apiFetch<{ data: StaffMember[] }>("/staff/?per_page=200"),
      apiFetch<Assignment[]>("/assignments/?per_page=500"),
      agendaFetch,
    ])
      .then(([projectsRes, invoicesRes, staffRes, assignmentsRes, agendaRes]) => {
        if (!cancelled) {
          const invoices: InvoiceSummary[] =
            (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ?? [];
          const rawStaff = (staffRes as { data?: unknown })?.data;
          const staff: StaffMember[] = Array.isArray(rawStaff) ? (rawStaff as StaffMember[]) : [];
          const assignments: Assignment[] = Array.isArray(assignmentsRes)
            ? (assignmentsRes as Assignment[])
            : [];

          setStats(computeStats(projectsRes.data, invoices, staff, assignments));

          // Recent projects: sort by updated_at desc, take top 5.
          const sorted = [...projectsRes.data]
            .sort((a, b) => {
              const ta = (a as unknown as { updated_at?: string }).updated_at ?? "";
              const tb = (b as unknown as { updated_at?: string }).updated_at ?? "";
              return tb.localeCompare(ta);
            })
            .slice(0, 5)
            .map((p) => ({
              id: p.id,
              name: p.name,
              status: p.status,
              updated_at: (p as unknown as { updated_at?: string }).updated_at ?? null,
            }));
          setRecentProjects(sorted);

          // Upcoming tasks from agenda week view — non-done tasks today or later.
          if (agendaRes && "days" in agendaRes) {
            const today = new Date().toISOString().slice(0, 10);
            const upcoming = agendaRes.days
              .flatMap((day: AgendaDayResponse) =>
                day.tasks
                  .filter((t) => t.status !== "done" && day.date >= today)
                  .map((t) => ({ ...t, date: day.date }))
              )
              .slice(0, 5);
            setUpcomingTasks(upcoming);
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
        <div data-testid="dashboard-loading">
          <KpiCards stats={null} loading={true} error={null} />
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
          <KpiCards stats={stats} loading={false} error={null} />

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
