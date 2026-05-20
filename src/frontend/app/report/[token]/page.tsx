"use client";

import React, { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportData {
  id: string;
  project_id: string;
  type: "weekly" | "completion";
  title: string;
  period_start: string | null;
  period_end: string | null;
  data: Record<string, any>;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly sections
// ---------------------------------------------------------------------------

function WeeklySections({ data }: { data: Record<string, any> }) {
  const voltooidDezeWeek = data.voltooid_deze_week ?? [];
  const urenPerFase = data.uren_per_fase ?? [];
  const planVolgendeWeek = data.plan_volgende_week ?? [];

  return (
    <>
      {voltooidDezeWeek.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Voltooid deze week</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Taak</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Fase</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Uren</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {voltooidDezeWeek.map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{item.naam}</td>
                    <td className="px-4 py-2 text-gray-600">{item.fase}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{item.uren}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {urenPerFase.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Uren per fase</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Fase</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Uren</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {urenPerFase.map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{item.fase}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{item.uren}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {planVolgendeWeek.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Plan volgende week</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Taak</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Fase</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {planVolgendeWeek.map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{item.naam}</td>
                    <td className="px-4 py-2 text-gray-600">{item.fase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Completion sections
// ---------------------------------------------------------------------------

function CompletionSections({ data }: { data: Record<string, any> }) {
  const timeline = data.timeline;
  const budgetCents = data.budget_cents ?? 0;
  const kostenCents = data.kosten_cents ?? 0;
  const fasen = data.fasen ?? [];

  return (
    <>
      {timeline && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Tijdlijn</h2>
          <div className="grid grid-cols-2 gap-4 text-sm rounded-lg border p-4">
            <div>
              <p className="font-medium text-gray-500">Gepland</p>
              <p className="mt-1">
                {formatDate(timeline.gepland_start)} – {formatDate(timeline.gepland_eind)}
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Werkelijk</p>
              <p className="mt-1">
                {formatDate(timeline.werkelijk_start)} – {formatDate(timeline.werkelijk_eind)}
              </p>
            </div>
          </div>
        </section>
      )}

      {budgetCents > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Budget vs Kosten</h2>
          <div className="grid grid-cols-2 gap-4 text-sm rounded-lg border p-4">
            <div>
              <p className="font-medium text-gray-500">Budget</p>
              <p className="mt-1 text-lg font-semibold">{formatMoney(budgetCents)}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Werkelijke kosten</p>
              <p className="mt-1 text-lg font-semibold">{formatMoney(kostenCents)}</p>
            </div>
          </div>
        </section>
      )}

      {fasen.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Faseverdeling</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Fase</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Uren</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-600">Kosten</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fasen.map((fase: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{fase.fase}</td>
                    <td className="px-4 py-2 text-gray-600">{fase.status}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fase.uren}</td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {formatMoney(fase.kosten_cents ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ token: string }>;
}

export default function CustomerReportPage({ params }: Props) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ token }) => {
      fetch(`${API_BASE}/reports/shared/${token}`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Rapport niet gevonden");
          }
          return res.json();
        })
        .then(setReport)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Laden…</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 mb-2">
            Rapport niet gevonden
          </p>
          <p className="text-sm text-gray-500">
            Deze link is ongeldig of verlopen.
          </p>
        </div>
      </div>
    );
  }

  const data = report.data;
  const takenTotaal = data.taken_totaal ?? 0;
  const voltooid = data.voltooid ?? 0;
  const uren = data.uren ?? 0;
  const kostenCents = data.kosten_cents ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Brand header */}
        <header className="mb-8 flex items-center justify-between border-b border-teal-600 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
            {data.project_name && (
              <p className="mt-1 text-sm text-gray-500">{data.project_name}</p>
            )}
            {report.type === "weekly" && report.period_start && report.period_end && (
              <p className="mt-1 text-sm text-gray-500">
                Week van {formatDate(report.period_start)} t/m {formatDate(report.period_end)}
              </p>
            )}
          </div>
          <span className="text-xl font-bold text-teal-700 tracking-wide">
            foreman
          </span>
        </header>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
          <KpiCard label="Taken" value={String(takenTotaal)} />
          <KpiCard label="Voltooid" value={String(voltooid)} />
          <KpiCard label="Uren" value={String(uren)} />
          <KpiCard label="Kosten" value={formatMoney(kostenCents)} />
        </div>

        {/* Report-type-specific sections */}
        <div className="space-y-8">
          {report.type === "weekly" && <WeeklySections data={data} />}
          {report.type === "completion" && <CompletionSections data={data} />}
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t pt-6 text-center">
          <p className="text-xs text-gray-400">
            Rapport gegenereerd door Foreman
          </p>
        </footer>
      </div>
    </div>
  );
}
