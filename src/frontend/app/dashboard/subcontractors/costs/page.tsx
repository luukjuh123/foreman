"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Users, TrendingUp, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";
import type {
  SubcontractorResponse,
  SubcontractorListResponse,
  SubcontractorCostSummary,
} from "@/lib/subcontractors";
import { formatRate } from "@/lib/subcontractors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubWithCosts {
  sub: SubcontractorResponse;
  costs: SubcontractorCostSummary | null;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubcontractorCostDashboard() {
  const [data, setData] = useState<SubWithCosts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch<SubcontractorListResponse>(
          "/subcontractors/?page=1&per_page=100"
        );
        const subs = res.data;

        const withCosts = await Promise.all(
          subs.map(async (sub) => {
            try {
              const costs = await apiFetch<SubcontractorCostSummary>(
                `/subcontractors/${sub.id}/costs`
              );
              return { sub, costs };
            } catch {
              return { sub, costs: null };
            }
          })
        );

        setData(withCosts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Onbekende fout");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div data-testid="subcontractor-costs-loading" className="space-y-6">
        <Skeleton className="h-8 w-64" />
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div
        data-testid="subcontractor-costs-error"
        className="rounded-md bg-red-50 p-4 text-sm text-red-700"
      >
        {error}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (data.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Onderaannemer Kosten"
          description="Contractering overzicht en kostenanalyse"
        />
        <p className="text-sm text-muted-foreground">
          Geen onderaannemer kosten gevonden.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------

  const totalSpend = data.reduce(
    (sum, d) => sum + (d.costs?.total_cost_cents ?? 0),
    0
  );

  const activeSubs = data.filter((d) => d.sub.active).length;

  const totalAssignments = data.reduce(
    (sum, d) => sum + (d.costs?.project_breakdown?.length ?? 0),
    0
  );

  const chartData = data
    .filter((d) => d.costs != null && d.costs.total_cost_cents > 0)
    .map((d) => ({
      name: d.sub.company_name,
      kosten: d.costs!.total_cost_cents / 100,
    }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Onderaannemer Kosten"
        description="Contractering overzicht en kostenanalyse"
      />

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Totaal gecontracteerd"
          value={formatRate(totalSpend)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Actieve onderaannemers"
          value={activeSubs}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Project koppelingen"
          value={totalAssignments}
          icon={<Briefcase className="h-4 w-4" />}
        />
      </div>

      {/* Margeanalyse / Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margeanalyse</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat("nl-NL", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(v)
                  }
                />
                <Tooltip
                  formatter={(value: number) => [
                    new Intl.NumberFormat("nl-NL", {
                      style: "currency",
                      currency: "EUR",
                    }).format(value),
                    "Kosten",
                  ]}
                />
                <Bar dataKey="kosten" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">
              Geen kostendata beschikbaar voor grafiek.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-subcontractor breakdown */}
      <div className="space-y-4">
        {data.map(({ sub, costs }) => (
          <Card key={sub.id} data-testid={`sub-cost-row-${sub.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{sub.company_name}</CardTitle>
                <span className="text-sm font-semibold">
                  {costs != null ? formatRate(costs.total_cost_cents) : "—"}
                </span>
              </div>
            </CardHeader>

            {costs && costs.project_breakdown.length > 0 && (
              <CardContent className="pt-0">
                <ul className="divide-y divide-border text-sm">
                  {costs.project_breakdown.map((pb) => (
                    <li
                      key={pb.project_id}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-muted-foreground">{pb.project_name}</span>
                      <span className="font-medium">{formatRate(pb.cost_cents)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
