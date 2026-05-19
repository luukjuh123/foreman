"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle } from "lucide-react";
import { listProjects, formatBudget } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { ProjectResponse } from "@/lib/types";

interface TotalCostResponse {
  project_id: string;
  breakdown: {
    labor_cents: number;
    materials_cents: number;
    other_cents: number;
  };
  total_cents: number;
  materials_missing_count: number;
}

export default function MaterialCostTrackerPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [costData, setCostData] = useState<TotalCostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Load project list on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listProjects(1, 100)
      .then((res) => {
        if (cancelled) return;
        setProjects(res.data);
        if (res.data.length > 0) {
          setSelectedProjectId(res.data[0].id);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Onbekende fout");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load cost data whenever selected project changes
  useEffect(() => {
    if (!selectedProjectId) return;

    let cancelled = false;
    setCostLoading(true);
    setCostData(null);

    apiFetch<TotalCostResponse>(
      `/financials/projects/${selectedProjectId}/total-cost`
    )
      .then((data) => {
        if (cancelled) return;
        setCostData(data);
        setCostLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCostLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  if (loading) {
    return (
      <div data-testid="materials-loading" className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="pt-6">
            <div className="h-32 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="materials-error"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        Gegevens konden niet worden geladen: {error}
      </div>
    );
  }

  const materialsCents = costData?.breakdown.materials_cents ?? 0;
  const missingCount = costData?.materials_missing_count ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Materiaalkosten</h1>
      </div>

      {/* Project selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Project selecteren</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            data-testid="project-selector"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Cost summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Overzicht materiaalkosten</CardTitle>
          {missingCount > 0 && !costLoading && (
            <span
              data-testid="missing-price-badge"
              className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            >
              <AlertTriangle className="h-3 w-3" />
              {missingCount} ontbrekende prijzen
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {costLoading ? (
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="font-semibold text-foreground">Totaal</span>
              <span
                data-testid="materials-total"
                className="text-xl font-bold text-foreground"
              >
                {formatBudget(materialsCents)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Material line items — placeholder until bouwmarkt integration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiaallijst</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Table header — ready for per-material rows when endpoint is available */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">Naam</th>
                <th className="pb-2 pr-4">Hoeveelheid</th>
                <th className="pb-2 pr-4">Eenheid</th>
                <th className="pb-2 pr-4">Stukprijs</th>
                <th className="pb-2 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={5}
                  className="pt-4 text-center text-sm text-muted-foreground"
                >
                  Gedetailleerde materiaallijst beschikbaar na koppeling met bouwmarkt
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
