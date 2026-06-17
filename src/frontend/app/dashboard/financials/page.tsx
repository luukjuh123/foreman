"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import type { ProjectResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TotalCostResponse {
  total_cents: number;
  hourly_rate_cents: number;
  breakdown: {
    materials_cents: number;
    labor_cents: number;
    equipment_cents: number;
    overhead_cents: number;
    other_cents: number;
  };
  materials_missing_count: number;
}

interface ProjectFinancials {
  project: ProjectResponse;
  totalCost: TotalCostResponse | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialsPage() {
  const [data, setData] = useState<ProjectFinancials[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await listProjects(1, 100);
        const projects = res.data;

        const financials = await Promise.all(
          projects.map(async (project) => {
            try {
              const cost = await apiFetch<TotalCostResponse>(
                `/financials/projects/${project.id}/total-cost`
              );
              return { project, totalCost: cost };
            } catch {
              return { project, totalCost: null };
            }
          })
        );

        setData(financials);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Onbekende fout");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ---------------------------------------------------------------------------
  // Aggregate totals (only when data is available)
  // ---------------------------------------------------------------------------

  const totalBudgetCents = data.reduce(
    (sum, { project }) => sum + (project.budget_cents ?? 0),
    0
  );
  const totalSpentCents = data.reduce(
    (sum, { totalCost }) => sum + (totalCost?.total_cents ?? 0),
    0
  );
  const remainingCents = totalBudgetCents - totalSpentCents;
  const overBudget = remainingCents < 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overzicht Financiën"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Financieel" },
          { label: "Financiën" },
        ]}
      />

      {/* Boekhouding navigation — always visible */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Boekhouding</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href="/dashboard/financials/balance-sheet">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Balans</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Activa, passiva en eigen vermogen</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/financials/income-statement">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Winst &amp; Verlies</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Opbrengsten en kosten per periode</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/financials/cash-flow">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Kasstroom</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Overzicht geldstromen per periode</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div data-testid="financials-loading" className="space-y-6">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          data-testid="financials-error"
          className="rounded border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card data-testid="summary-totaal-budget">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totaal Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBudget(totalBudgetCents)}</p>
          </CardContent>
        </Card>

        <Card data-testid="summary-besteed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Besteed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBudget(totalSpentCents)}</p>
          </CardContent>
        </Card>

        <Card data-testid="summary-resterend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resterend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                overBudget ? "text-2xl font-bold text-destructive" : "text-2xl font-bold text-green-600"
              }
            >
              {formatBudget(remainingCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget variance indicator */}
      <div
        data-testid="budget-variance"
        className={
          overBudget
            ? "flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            : remainingCents === 0
            ? "flex items-center gap-2 rounded border border-muted bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
            : "flex items-center gap-2 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700"
        }
      >
        {overBudget ? (
          <>
            <TrendingDown className="h-4 w-4" />
            <span>Over budget met {formatBudget(Math.abs(remainingCents))}</span>
          </>
        ) : remainingCents === 0 ? (
          <>
            <Minus className="h-4 w-4" />
            <span>Precies op budget</span>
          </>
        ) : (
          <>
            <TrendingUp className="h-4 w-4" />
            <span>Onder budget — {formatBudget(remainingCents)} over</span>
          </>
        )}
      </div>

      {/* Per-project rows */}
      <div className="space-y-3">
        {data.map(({ project, totalCost }) => {
          const budget = project.budget_cents ?? 0;
          const spent = totalCost?.total_cents ?? 0;
          const remaining = budget - spent;
          const projectOverBudget = remaining < 0;

          return (
            <Card key={project.id} data-testid={`project-row-${project.id}`}>
              <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{project.name}</p>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Budget: </span>
                    <span className="font-medium" data-testid={`budget-${project.id}`}>
                      {project.budget_cents != null ? formatBudget(project.budget_cents) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Besteed: </span>
                    <span className="font-medium" data-testid={`spent-${project.id}`}>
                      {totalCost != null ? formatBudget(spent) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Resterend: </span>
                    <span
                      className={
                        projectOverBudget ? "font-medium text-destructive" : "font-medium text-green-600"
                      }
                      data-testid={`remaining-${project.id}`}
                    >
                      {project.budget_cents != null && totalCost != null
                        ? formatBudget(remaining)
                        : "—"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
