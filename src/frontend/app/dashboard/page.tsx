"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjects } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse } from "@/lib/types";
import { KpiCards, computeStaffUtilization, type DashboardStats } from "@/components/dashboard/kpi-cards";

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listProjects(1, 100),
      apiFetch<InvoiceListData>("/invoices/?per_page=200"),
      apiFetch<{ data: StaffMember[] }>("/staff/?per_page=200"),
      apiFetch<Assignment[]>("/assignments/?per_page=500"),
    ])
      .then(([projectsRes, invoicesRes, staffRes, assignmentsRes]) => {
        if (!cancelled) {
          const invoices: InvoiceSummary[] =
            (invoicesRes as { data?: { data?: InvoiceSummary[] } })?.data?.data ?? [];
          const rawStaff = (staffRes as { data?: unknown })?.data;
          const staff: StaffMember[] = Array.isArray(rawStaff) ? (rawStaff as StaffMember[]) : [];
          const assignments: Assignment[] = Array.isArray(assignmentsRes)
            ? (assignmentsRes as Assignment[])
            : [];
          setStats(computeStats(projectsRes.data, invoices, staff, assignments));
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
                <p className="text-sm text-muted-foreground">Geen recente activiteit.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aankomende Taken</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Geen aankomende taken.</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
