"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calculator, TrendingUp, TrendingDown } from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProfitMarginPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [hourlyRateCents, setHourlyRateCents] = useState<number>(8500);
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("85");

  const [totalCost, setTotalCost] = useState<TotalCostResponse | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Fetch project list on mount
  useEffect(() => {
    listProjects(1, 100)
      .then((res) => {
        setProjects(res.data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Fetch cost when project or hourly rate changes
  const fetchCost = useCallback(async (projectId: string, rateCents: number) => {
    if (!projectId) return;
    setCostLoading(true);
    try {
      const data = await apiFetch<TotalCostResponse>(
        `/financials/projects/${projectId}/total-cost?hourly_rate_cents=${rateCents}`
      );
      setTotalCost(data);
    } catch {
      setTotalCost(null);
    } finally {
      setCostLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchCost(selectedProjectId, hourlyRateCents);
    } else {
      setTotalCost(null);
    }
  }, [selectedProjectId, hourlyRateCents, fetchCost]);

  // Auto-select first project when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const budgetCents = selectedProject?.budget_cents ?? 0;
  const costCents = totalCost?.total_cents ?? 0;
  const marginCents = budgetCents - costCents;
  const marginPct = budgetCents > 0 ? (marginCents / budgetCents) * 100 : 0;
  const isNegative = marginCents < 0;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleHourlyRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setHourlyRateInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setHourlyRateCents(Math.round(parsed * 100));
    }
  }

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedProjectId(e.target.value);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div data-testid="margin-loading" className="p-6 space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-40 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="margin-error" className="p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Winstmarge Calculator</h1>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project selecteren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Project selector */}
          <div className="space-y-1">
            <label htmlFor="project-selector" className="text-sm font-medium">
              Project
            </label>
            <select
              id="project-selector"
              data-testid="project-selector"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedProjectId}
              onChange={handleProjectChange}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hourly rate input */}
          <div className="space-y-1">
            <label htmlFor="hourly-rate-input" className="text-sm font-medium">
              Uurtarief (€)
            </label>
            <Input
              id="hourly-rate-input"
              data-testid="hourly-rate-input"
              type="number"
              min="0"
              step="0.50"
              value={hourlyRateInput}
              onChange={handleHourlyRateChange}
              className="max-w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Margin calculation — shown once a project is selected */}
      {selectedProject && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Budget (revenue) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Omzet (Budget)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                data-testid="budget-amount"
                className="text-xl font-semibold"
              >
                {selectedProject.budget_cents != null
                  ? formatBudget(selectedProject.budget_cents)
                  : "—"}
              </p>
            </CardContent>
          </Card>

          {/* Total cost */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Kosten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p data-testid="cost-amount" className="text-xl font-semibold">
                {costLoading ? "…" : totalCost ? formatBudget(totalCost.total_cents) : "—"}
              </p>
            </CardContent>
          </Card>

          {/* Gross margin */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Bruto Marge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                data-testid="margin-indicator"
                data-negative={String(isNegative)}
                className={
                  isNegative ? "flex items-center gap-1 text-red-600" : "flex items-center gap-1 text-green-600"
                }
              >
                {isNegative ? (
                  <TrendingDown className="h-4 w-4 shrink-0" />
                ) : (
                  <TrendingUp className="h-4 w-4 shrink-0" />
                )}
                <p data-testid="margin-amount" className="text-xl font-semibold">
                  {costLoading ? "…" : totalCost ? formatBudget(marginCents) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Margin % */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Marge %
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                data-testid="margin-percentage"
                className={
                  isNegative ? "text-xl font-semibold text-red-600" : "text-xl font-semibold text-green-600"
                }
              >
                {costLoading ? "…" : totalCost ? `${marginPct.toFixed(1)}%` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
