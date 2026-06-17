"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { formatBudget } from "@/lib/projects";
import { formatMoney } from "@/lib/invoice-helpers";
import type { InvoiceResponse, InvoiceListResponse, ProjectResponse } from "@/lib/types";
import { ProjectHubTabBar } from "@/components/project-hub/ProjectHubTabBar";

// ---------------------------------------------------------------------------
// Invoice status helpers
// ---------------------------------------------------------------------------

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  sent: "Verstuurd",
  paid: "Betaald",
  overdue: "Verlopen",
};

const INVOICE_STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function formatInvDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Cost breakdown helpers
// ---------------------------------------------------------------------------

interface CostBreakdown {
  totalBudgetCents: number | null;
  laborCostCents: number;
  phases: Array<{
    name: string;
    laborCostCents: number;
    taskCount: number;
  }>;
}

function buildCostBreakdown(project: ProjectResponse): CostBreakdown {
  let laborCostCents = 0;
  const phases = project.phases.map((phase) => {
    const phaseCost = phase.tasks.reduce(
      (sum, t) => sum + (t.labor_cost_cents ?? 0),
      0
    );
    laborCostCents += phaseCost;
    return {
      name: phase.name,
      laborCostCents: phaseCost,
      taskCount: phase.tasks.length,
    };
  });

  return {
    totalBudgetCents: project.budget_cents,
    laborCostCents,
    phases,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancieelPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProjectResponse>(`/projects/${projectId}`)
      .then(setProject)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingProject(false));

    apiFetch<InvoiceListResponse>(`/invoices?project_id=${projectId}&per_page=50`)
      .then((res) => setInvoices(res.data))
      .catch(() => {
        // Invoices may not support project_id filter — fall back silently
        setInvoices([]);
      })
      .finally(() => setLoadingInvoices(false));
  }, [projectId]);

  const loading = loadingProject || loadingInvoices;
  const costs = project ? buildCostBreakdown(project) : null;

  // Summary totals
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total_cents, 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.total_cents, 0);

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/projects/${projectId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar project
        </Button>
      </Link>

      <ProjectHubTabBar projectId={projectId} />

      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Financieel</h2>
        <p className="text-sm text-muted-foreground">
          Budgetoverzicht, kosten en gekoppelde facturen.
        </p>
      </div>

      {/* Summary KPIs */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-xl font-bold text-foreground">
                  {costs?.totalBudgetCents != null
                    ? formatBudget(costs.totalBudgetCents)
                    : "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Gefactureerd</p>
                <p className="text-xl font-bold text-foreground">
                  {formatMoney(totalInvoiced)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Ontvangen</p>
                <p className="text-xl font-bold text-green-600">
                  {formatMoney(totalPaid)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cost breakdown per phase */}
          {costs && costs.phases.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingDown className="h-4 w-4" />
                  Kosten per fase
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {costs.phases.map((phase) => (
                    <div
                      key={phase.name}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-foreground">{phase.name}</span>
                      <span className="text-muted-foreground">
                        {phase.laborCostCents > 0
                          ? formatMoney(phase.laborCostCents)
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                {costs.laborCostCents > 0 && (
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
                    <span>Totaal arbeidskosten</span>
                    <span>{formatMoney(costs.laborCostCents)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Invoices table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                Facturen
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Geen facturen gekoppeld aan dit project.
                  </p>
                  <Link
                    href={`/dashboard/invoices/new?project_id=${projectId}`}
                    className="mt-2 inline-block text-sm text-primary hover:underline"
                  >
                    Nieuwe factuur aanmaken
                  </Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/dashboard/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {inv.invoice_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatInvDate(inv.issue_date)} · vervaldatum{" "}
                          {formatInvDate(inv.due_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium">
                          {formatMoney(inv.total_cents)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            INVOICE_STATUS_CLASS[inv.status] ??
                              "bg-gray-100 text-gray-700"
                          )}
                        >
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
