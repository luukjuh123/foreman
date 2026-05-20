"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ---------------------------------------------------------------------------
// Types (inline — this page runs outside the dashboard, keep self-contained)
// ---------------------------------------------------------------------------

interface ReportData {
  id: string;
  project_id: string;
  type: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  data: Record<string, unknown>;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Branded report renderer
// ---------------------------------------------------------------------------

function BrandedReport({ report }: { report: ReportData }) {
  const d = report.data;
  const project = d.project as Record<string, unknown> | undefined;
  const totals = d.totals as Record<string, number> | undefined;
  const reportType = d.type as string | undefined;

  // Weekly-specific
  const completed = (d.completed_this_week as Record<string, unknown>[]) ?? [];
  const hoursByPhase = (d.hours_by_phase as Record<string, unknown>[]) ?? [];

  // Completion-specific
  const timeline = d.timeline as Record<string, unknown> | undefined;
  const costsVsBudget = d.costs_vs_budget as Record<string, unknown> | undefined;
  const phaseSummary = (d.phase_summary as Record<string, unknown>[]) ?? [];

  // Generic
  const phases = (d.phases as Record<string, unknown>[]) ?? [];
  const tasks = (d.tasks as Record<string, unknown>[]) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b-4 border-teal-600 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
            {project && (
              <p className="text-sm text-gray-500 mt-1">
                {project.name as string}
                {project.description ? ` — ${project.description as string}` : ""}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Gegenereerd op {formatDate(report.created_at)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-teal-600 tracking-wide">
              foreman
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* KPIs */}
        {totals && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Taken", value: String(totals.task_count) },
              { label: "Afgerond", value: String(totals.completed_task_count) },
              { label: "Uren", value: (totals.estimated_hours ?? 0).toFixed(1) },
              { label: "Arbeidskosten", value: formatMoney(totals.labor_cost_cents ?? 0) },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg bg-white p-4 text-center shadow-sm border"
              >
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Completion: Timeline */}
        {reportType === "completion" && timeline && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Tijdlijn
            </h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500" />
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Start</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Eind</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Dagen</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-2 font-medium">Gepland</td>
                    <td className="px-4 py-2 text-gray-600">{(timeline.planned_start as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{(timeline.planned_end as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{String(timeline.planned_duration_days ?? "—")}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">Werkelijk</td>
                    <td className="px-4 py-2 text-gray-600">{(timeline.actual_start as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{(timeline.actual_end as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{String(timeline.actual_duration_days ?? "—")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Completion: Costs vs Budget */}
        {reportType === "completion" && costsVsBudget && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Kosten vs Budget
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm border text-center">
                <p className="text-xs text-gray-500">Budget</p>
                <p className="font-bold text-gray-900">{formatMoney(costsVsBudget.budget_cents as number)}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm border text-center">
                <p className="text-xs text-gray-500">Werkelijk</p>
                <p className="font-bold text-gray-900">{formatMoney(costsVsBudget.actual_cost_cents as number)}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm border text-center">
                <p className="text-xs text-gray-500">Verschil</p>
                <p className={`font-bold ${(costsVsBudget.over_budget as boolean) ? "text-red-600" : "text-green-600"}`}>
                  {formatMoney(costsVsBudget.variance_cents as number)}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Completion: Phase summary */}
        {reportType === "completion" && phaseSummary.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Fase overzicht
            </h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Fase</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Taken</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Afgerond</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {phaseSummary.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.phase_name as string}</td>
                      <td className="px-4 py-2 text-gray-600">{p.status as string}</td>
                      <td className="px-4 py-2 text-gray-600">{String(p.task_count)}</td>
                      <td className="px-4 py-2 text-gray-600">{String(p.completed_task_count)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(p.actual_cost_cents as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Weekly: Completed this week */}
        {reportType === "weekly" && completed.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Afgerond deze week
            </h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Taak</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Fase</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Uren</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {completed.map((t, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{t.name as string}</td>
                      <td className="px-4 py-2 text-gray-600">{t.phase_name as string}</td>
                      <td className="px-4 py-2 text-right">{(t.estimated_hours as number).toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(t.labor_cost_cents as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Weekly: Hours by phase */}
        {reportType === "weekly" && hoursByPhase.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Uren per fase
            </h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Fase</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Taken</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Uren</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hoursByPhase.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.phase_name as string}</td>
                      <td className="px-4 py-2 text-gray-600">{String(p.task_count)}</td>
                      <td className="px-4 py-2 text-right">{(p.estimated_hours as number).toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(p.labor_cost_cents as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Generic: phases and tasks (fallback) */}
        {!reportType && phases.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Fasen
            </h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Fase</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {phases.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.name as string}</td>
                      <td className="px-4 py-2 text-gray-600">{p.status as string}</td>
                      <td className="px-4 py-2 text-gray-600">{String(p.task_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tasks.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2 mb-3">
              Taken
            </h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Taak</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Uren</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tasks.map((t, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{t.name as string}</td>
                      <td className="px-4 py-2 text-gray-600">{t.status as string}</td>
                      <td className="px-4 py-2 text-right">{(t.estimated_hours as number).toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(t.labor_cost_cents as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="mx-auto max-w-3xl px-6 py-4 text-center">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-teal-600">Foreman</span> — AI-powered bouwmanagement
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublicReportPage() {
  const params = useParams();
  const token = params.token as string;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/reports/shared/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? `Fout ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setReport(data as ReportData))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Rapport laden…</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-3">
          <h1 className="text-xl font-bold text-gray-900">Rapport niet gevonden</h1>
          <p className="text-sm text-gray-500">
            Deze link is ongeldig of het rapport is niet meer gedeeld.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Powered by <span className="font-semibold text-teal-600">Foreman</span>
          </p>
        </div>
      </div>
    );
  }

  return <BrandedReport report={report} />;
}
