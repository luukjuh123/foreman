"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatBudget } from "@/lib/projects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectMargin {
  project_id: string;
  project_name: string;
  revenue_cents: number;
  labor_cost_cents: number;
  material_cost_cents: number;
  margin_cents: number;
  margin_percentage: number;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/**
 * Maps margin percentage to a Tailwind background color class.
 * > 30%   → deep green
 * 10–30%  → light green
 * 0–10%   → yellow
 * < 0%    → red
 */
function marginColorClass(pct: number): string {
  if (pct > 30) return "bg-green-600 text-white";
  if (pct > 10) return "bg-green-300 text-green-900";
  if (pct >= 0) return "bg-yellow-200 text-yellow-900";
  return "bg-red-500 text-white";
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProfitabilityHeatmapPage() {
  const router = useRouter();
  const [margins, setMargins] = useState<ProjectMargin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<ProjectMargin[]>(`/analytics/profitability${qs}`);
      setMargins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleCellClick(projectId: string) {
    router.push(`/dashboard/projects/${projectId}/financials`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-foreground">Winstgevendheid Heatmap</h1>

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="date-start">
            Startdatum
          </label>
          <input
            id="date-start"
            data-testid="date-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="date-end">
            Einddatum
          </label>
          <input
            id="date-end"
            data-testid="date-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div data-testid="heatmap-loading" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          data-testid="heatmap-error"
          className="rounded border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Gegevens konden niet worden geladen: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && margins.length === 0 && (
        <div
          data-testid="heatmap-empty"
          className="rounded border border-muted bg-muted/20 p-8 text-center text-sm text-muted-foreground"
        >
          Geen projecten gevonden in deze periode.
        </div>
      )}

      {/* Heatmap grid */}
      {!loading && !error && margins.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {margins.map((item) => {
            const isPositive = item.margin_cents >= 0;
            const colorClass = marginColorClass(item.margin_percentage);
            return (
              <button
                key={item.project_id}
                data-testid={`heatmap-cell-${item.project_id}`}
                data-positive={isPositive ? "true" : "false"}
                data-negative={!isPositive ? "true" : "false"}
                onClick={() => handleCellClick(item.project_id)}
                className={`rounded-lg p-4 text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring ${colorClass}`}
                aria-label={`${item.project_name}: ${item.margin_percentage.toFixed(1)}% marge`}
              >
                <p className="line-clamp-2 text-sm font-semibold leading-tight">
                  {item.project_name}
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {item.margin_percentage.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-xs opacity-80">
                  {formatBudget(item.margin_cents)}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && !error && margins.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Legenda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-green-600" />
                <span>&gt; 30% marge</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-green-300" />
                <span>10–30% marge</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-yellow-200" />
                <span>0–10% marge</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-red-500" />
                <span>Negatieve marge</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
