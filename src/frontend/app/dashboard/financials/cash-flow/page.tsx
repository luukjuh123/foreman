"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchCashFlow, formatCents } from "@/lib/financials";
import type { CashFlowResponse, CashFlowLine } from "@/lib/financials";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentYear(): { start: string; end: string } {
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

type Granularity = "maandelijks" | "kwartaal" | "jaarlijks";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActivitySection({
  title,
  lines,
  total,
}: {
  title: string;
  lines: CashFlowLine[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Code
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Omschrijving
              </th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                Bedrag
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => (
              <tr key={line.account_id}>
                <td className="px-4 py-2 text-muted-foreground">{line.code}</td>
                <td className="px-4 py-2">{line.name}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {formatCents(line.change_cents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/30">
            <tr>
              <td colSpan={2} className="px-4 py-2 font-semibold">
                Totaal
              </td>
              <td className="px-4 py-2 text-right font-semibold font-mono">
                {formatCents(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  cents,
  highlight,
}: {
  label: string;
  cents: number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`text-2xl font-bold font-mono ${cents < 0 ? "text-destructive" : "text-foreground"}`}
        >
          {formatCents(cents)}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CashFlowPage() {
  const defaults = currentYear();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [granularity, setGranularity] = useState<Granularity>("jaarlijks");
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCashFlow(startDate, endDate);
      setData(result);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------------------------------------------------------
  // Loading / error
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Kasstroomoverzicht</h1>
        <p className="text-sm text-muted-foreground">Laden…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Kasstroomoverzicht</h1>
        <p className="text-sm text-destructive">{error ?? "Geen gegevens beschikbaar."}</p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Chart data
  // ------------------------------------------------------------------

  const chartData = [
    {
      name: "Operationeel",
      bedrag: data.operating_activities.total_cents / 100,
    },
    {
      name: "Investering",
      bedrag: data.investing_activities.total_cents / 100,
    },
    {
      name: "Financiering",
      bedrag: data.financing_activities.total_cents / 100,
    },
  ];

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Kasstroomoverzicht
        </h1>

        {/* Period + granularity controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="start-date">
              Van
            </label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-36 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="end-date">
              Tot
            </label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-36 text-sm"
            />
          </div>
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {(["maandelijks", "kwartaal", "jaarlijks"] as Granularity[]).map(
              (g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    granularity === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              )
            )}
          </div>
          <Button size="sm" onClick={load}>
            Vernieuwen
          </Button>
        </div>
      </div>

      {/* Reconciliation status */}
      <div
        data-testid="reconciliation-status"
        className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
          data.reconciles
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        }`}
      >
        {data.reconciles
          ? "Aansluiting klopt"
          : "Aansluiting niet correct — verschil gedetecteerd"}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Opening kas" cents={data.opening_cash_cents} />
        <SummaryCard label="Netto wijziging" cents={data.net_change_in_cash_cents} />
        <SummaryCard
          label="Slotstand kas"
          cents={data.ending_cash_cents}
          highlight
        />
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Kasstroom per categorie ({granularity})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat("nl-NL", {
                    notation: "compact",
                    currency: "EUR",
                  }).format(v)
                }
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) =>
                  new Intl.NumberFormat("nl-NL", {
                    style: "currency",
                    currency: "EUR",
                  }).format(value)
                }
              />
              <Legend />
              <Bar dataKey="bedrag" name="Bedrag (€)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity sections */}
      <ActivitySection
        title="Operationele Activiteiten"
        lines={data.operating_activities.lines}
        total={data.operating_activities.total_cents}
      />
      <ActivitySection
        title="Investeringsactiviteiten"
        lines={data.investing_activities.lines}
        total={data.investing_activities.total_cents}
      />
      <ActivitySection
        title="Financieringsactiviteiten"
        lines={data.financing_activities.lines}
        total={data.financing_activities.total_cents}
      />
    </div>
  );
}
