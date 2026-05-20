"use client";

import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { listProjects, formatBudget } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CostBreakdown {
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
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG = [
  { key: "materials_cents", label: "Materialen", color: "#3b82f6" },
  { key: "labor_cents",     label: "Arbeid",     color: "#10b981" },
  { key: "equipment_cents", label: "Apparatuur", color: "#f59e0b" },
  { key: "overhead_cents",  label: "Overhead",   color: "#8b5cf6" },
  { key: "other_cents",     label: "Overig",     color: "#6b7280" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CostBreakdownPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [costData, setCostData] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Load projects on mount
  useEffect(() => {
    listProjects(1, 100)
      .then((res) => {
        setProjects(res.data);
        if (res.data.length > 0) {
          setSelectedProjectId(res.data[0].id);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Fout bij laden projecten");
      })
      .finally(() => setLoading(false));
  }, []);

  // Load cost data when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setCostLoading(true);
    setCostData(null);
    apiFetch<CostBreakdown>(`/financials/projects/${selectedProjectId}/total-cost`)
      .then((data) => setCostData(data))
      .catch(() => setCostData(null))
      .finally(() => setCostLoading(false));
  }, [selectedProjectId]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div data-testid="cost-breakdown-loading" className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div data-testid="cost-breakdown-error" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Chart data
  // ---------------------------------------------------------------------------

  const chartData = costData
    ? CATEGORY_CONFIG.map((cat) => ({
        name: cat.label,
        value: costData.breakdown[cat.key],
        color: cat.color,
      })).filter((d) => d.value > 0)
    : [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Kostenanalyse</h1>
      </div>

      {/* Project selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            data-testid="project-selector"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(!selectedProjectId || projects.length === 0) && (
              <option value="" disabled>
                Selecteer project
              </option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Chart + breakdown */}
      {selectedProjectId && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Pie chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verdeling</CardTitle>
            </CardHeader>
            <CardContent>
              {costLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Laden…</p>
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatBudget(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Geen kostendata beschikbaar.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category totals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categorieën</CardTitle>
            </CardHeader>
            <CardContent>
              {costLoading ? (
                <div className="space-y-3">
                  {CATEGORY_CONFIG.map((cat) => (
                    <div key={cat.key} className="h-6 w-full animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : costData ? (
                <ul data-testid="category-breakdown" className="space-y-3">
                  {CATEGORY_CONFIG.map((cat) => {
                    const cents = costData.breakdown[cat.key];
                    const pct =
                      costData.total_cents > 0
                        ? Math.round((cents / costData.total_cents) * 100)
                        : 0;
                    return (
                      <li key={cat.key} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm">{cat.label}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{pct}%</span>
                          <span className="font-medium">{formatBudget(cents)}</span>
                        </div>
                      </li>
                    );
                  })}
                  <li className="border-t pt-3 flex items-center justify-between text-sm font-semibold">
                    <span>Totaal</span>
                    <span>{formatBudget(costData.total_cents)}</span>
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Geen kostendata beschikbaar.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
