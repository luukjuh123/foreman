"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjects } from "@/lib/projects";
import { formatDate } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse, AgendaTask, AgendaDayResponse } from "@/lib/types";
import { KpiCards, computeStaffUtilization, type DashboardStats } from "@/components/dashboard/kpi-cards";
import { fetchWeekAgenda } from "@/lib/agenda";

const ONBOARDING_KEY = "foreman_onboarding_done";

interface RecentProject {
  id: string;
  name: string;
  updated_at?: string | null;
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

interface StaffListData {
  data: StaffMember[];
  total: number;
}

function isOverdue(task: { status: string; end_date?: string | null }): boolean {
  if (task.status === "done") return false;
  if (!task.end_date) return false;
  return new Date(task.end_date) < new Date();
}

function computeStats(
  projects: ProjectResponse[],
  staff: StaffMember[],
  assignments: Assignment[],
): DashboardStats {
  const activeProjects = projects.filter((p) => p.status === "active").length;

  const overdueTasks = projects
    .flatMap((p) => p.phases ?? [])
    .flatMap((ph) => ph.tasks ?? [])
    .filter(isOverdue).length;

  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const staffUtilizationPct = computeStaffUtilization(staff, assignments, thisMonth);

  return { activeProjects, overdueTasks, monthlyRevenueCents: 0, staffUtilizationPct };
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
      apiFetch<StaffListData>("/staff/?per_page=200"),
      apiFetch<Assignment[]>("/assignments/?per_page=1000"),
      agendaFetch,
    ])
      .then(([projectsRes, staffRes, assignmentsRes, agendaRes]) => {
        if (!cancelled) {
          const staffList: StaffMember[] =
            (staffRes as { data?: StaffMember[] })?.data ?? [];
          const assignmentList: Assignment[] =
            Array.isArray(assignmentsRes) ? assignmentsRes : [];

          setStats(computeStats(projectsRes.data, staffList, assignmentList));

          // Recent projects: sorted by updated_at desc, capped at 5
          const sorted = [...projectsRes.data].sort((a, b) => {
            const at = (a as RecentProject).updated_at ?? "";
            const bt = (b as RecentProject).updated_at ?? "";
            return bt.localeCompare(at);
          });
          setRecentProjects(sorted.slice(0, 5));

          // Upcoming tasks from agenda: non-done tasks, max 5
          if (agendaRes) {
            const tasks: Array<AgendaTask & { date: string }> = (agendaRes.days ?? []).flatMap(
              (day: AgendaDayResponse) =>
                (day.tasks ?? [])
                  .filter((t) => t.status !== "done")
                  .map((t) => ({ ...t, date: day.date }))
            );
            setUpcomingTasks(tasks.slice(0, 5));
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
        <div data-testid="dashboard-loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
