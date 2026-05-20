"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCashFlow, formatCents } from "@/lib/financials";
import type { CashFlowLine, CashFlowResponse } from "@/lib/financials";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function currentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

// ---------------------------------------------------------------------------
// ActivityTable — lines table for one cash flow section
// ---------------------------------------------------------------------------

interface ActivityTableProps {
  lines: CashFlowLine[];
  total_cents: number;
  totalLabel: string;
}

function ActivityTable({ lines, total_cents, totalLabel }: ActivityTableProps) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b">
          <th className="py-1.5 pl-4 text-left text-xs font-medium text-gray-500">Code</th>
          <th className="py-1.5 text-left text-xs font-medium text-gray-500">Naam</th>
          <th className="py-1.5 pr-4 text-right text-xs font-medium text-gray-500">Bedrag</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.account_id} className="border-b last:border-0">
            <td className="py-2 pl-4 text-sm text-gray-500">{line.code}</td>
            <td className="py-2 text-sm">{line.name}</td>
            <td
              className={`py-2 pr-4 text-right text-sm tabular-nums ${
                line.change_cents >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {formatCents(line.change_cents)}
            </td>
          </tr>
        ))}
        <tr className="border-t bg-gray-50">
          <td className="py-2 pl-4 text-sm font-semibold" colSpan={2}>
            {totalLabel}
          </td>
          <td
            className={`py-2 pr-4 text-right text-sm font-semibold tabular-nums ${
              total_cents >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {formatCents(total_cents)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  cents: number;
}

function KpiCard({ label, cents }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p
          className={`text-xl font-bold tabular-nums mt-1 ${
            cents >= 0 ? "text-green-700" : "text-red-700"
          }`}
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
  const [startDate, setStartDate] = useState<string>(currentYearStart());
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCashFlow(start, end);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(startDate, endDate);
  }, [startDate, endDate, load]);

  // Chart data for the bar chart
  const chartData = data
    ? [
        { name: "Operationeel", cents: data.operating_activities.total_cents },
        { name: "Investering", cents: data.investing_activities.total_cents },
        { name: "Financiering", cents: data.financing_activities.total_cents },
      ]
    : [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kasstroomoverzicht</h1>
          <p className="text-gray-500 text-sm mt-1">
            Inzicht in kasstromen per activiteitentype
          </p>
        </div>
        {data && (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              data.reconciles
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {data.reconciles ? "Klopt" : "Afwijking"}
          </span>
        )}
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Startdatum
              </label>
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="JJJJ-MM-DD"
                className="border rounded px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Einddatum
              </label>
              <input
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="JJJJ-MM-DD"
                className="border rounded px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <p className="text-gray-500 text-sm">Laden...</p>}

      {/* Error */}
      {!loading && error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Netto inkomen" cents={data.net_income_cents} />
            <KpiCard label="Operationeel" cents={data.operating_activities.total_cents} />
            <KpiCard label="Investering" cents={data.investing_activities.total_cents} />
            <KpiCard label="Financiering" cents={data.financing_activities.total_cents} />
          </div>

          {/* Bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Kasstroom per categorie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v: number) => `€${(v / 100).toFixed(0)}`}
                    tick={{ fontSize: 11 }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCents(value)}
                    labelFormatter={(label: string) => label}
                  />
                  <Bar dataKey="cents" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.cents >= 0 ? "#16a34a" : "#dc2626"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Activity sections */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Operationele activiteiten
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityTable
                lines={data.operating_activities.lines}
                total_cents={data.operating_activities.total_cents}
                totalLabel="Totaal operationeel"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Investeringsactiviteiten
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityTable
                lines={data.investing_activities.lines}
                total_cents={data.investing_activities.total_cents}
                totalLabel="Totaal investering"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Financieringsactiviteiten
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityTable
                lines={data.financing_activities.lines}
                total_cents={data.financing_activities.total_cents}
                totalLabel="Totaal financiering"
              />
            </CardContent>
          </Card>

          {/* Cash summary footer */}
          <Card className="border-gray-300 bg-gray-50">
            <CardContent className="pt-4 pb-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Beginstand kas</span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatCents(data.opening_cash_cents)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Netto wijziging</span>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      data.net_change_in_cash_cents >= 0
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {formatCents(data.net_change_in_cash_cents)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-semibold">Eindstand kas</span>
                  <span className="text-base font-bold tabular-nums">
                    {formatCents(data.ending_cash_cents)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
