"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, AlertCircle, TrendingUp, Receipt, Users } from "lucide-react";
import { formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";

interface DashboardStats {
  active_projects: number;
  overdue_tasks: number;
  monthly_revenue_cents: number;
  outstanding_cents: number;
  staff_utilization_pct: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<DashboardStats>("/dashboard/stats")
      .then((data) => {
        if (!cancelled) {
          setStats(data);
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
                  {stats.active_projects}
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
                  style={stats.overdue_tasks > 0 ? { color: "var(--destructive)" } : undefined}
                >
                  {stats.overdue_tasks}
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
                  {formatBudget(stats.monthly_revenue_cents)}
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
                  {formatBudget(stats.outstanding_cents)}
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
                  {stats.staff_utilization_pct.toFixed(1)}%
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
