"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { ReportResponse, ReportShareResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  weekly: "Weekrapport",
  completion: "Eindrapport",
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  weekly: "bg-blue-100 text-blue-700",
  completion: "bg-green-100 text-green-700",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

interface ReportData {
  project_name?: string;
  tasks_total?: number;
  tasks_done?: number;
  hours_total?: number;
  cost_cents?: number;
  phases?: { name: string; tasks_total: number; tasks_done: number }[];
  tasks?: { name: string; status: string; phase: string }[];
  completed_this_week?: string[];
  plan_next_week?: string[];
  planned_end_date?: string;
  actual_end_date?: string;
  budget_cents?: number;
  actual_cost_cents?: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ReportDetailPage({ params }: Props) {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    params.then(({ id }) => {
      apiFetch<ReportResponse>(`/reports/${id}`)
        .then(setReport)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function handleShare() {
    if (!report) return;
    setSharing(true);
    try {
      const res = await apiFetch<ReportShareResponse>(`/reports/${report.id}/share`, {
        method: "POST",
      });
      setShareUrl(res.share_url);
      await navigator.clipboard.writeText(res.share_url).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delen mislukt");
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error || !report) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/reports/history">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug naar overzicht
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error ?? "Rapport niet gevonden."}</p>
      </div>
    );
  }

  const data = report.data as ReportData;
  const phases = data.phases ?? [];
  const tasks = data.tasks ?? [];
  const completedThisWeek = data.completed_this_week ?? [];
  const planNextWeek = data.plan_next_week ?? [];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/dashboard/reports/history">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar overzicht
        </Button>
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{report.title}</h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-sm font-medium",
              TYPE_BADGE_CLASS[report.type] ?? "bg-gray-100 text-gray-700"
            )}
          >
            {TYPE_LABELS[report.type] ?? report.type}
          </span>
        </div>

        {data.project_name && (
          <p className="text-muted-foreground">{data.project_name}</p>
        )}

        {(report.period_start || report.period_end) && (
          <p className="text-sm text-muted-foreground">
            Periode: {formatDate(report.period_start)} – {formatDate(report.period_end)}
          </p>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Taken" value={String(data.tasks_total ?? 0)} />
        <KpiCard label="Voltooid" value={String(data.tasks_done ?? 0)} />
        <KpiCard label="Uren" value={String(data.hours_total ?? 0)} />
        <KpiCard
          label="Kosten"
          value={formatMoney(data.cost_cents ?? 0)}
        />
      </div>

      {/* Phase breakdown */}
      {phases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faseverdeling</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Fase
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Totaal
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Afgerond
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {phases.map((phase) => (
                  <tr key={phase.name} className="hover:bg-muted/30">
                    <td className="px-4 py-2">{phase.name}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {phase.tasks_total}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {phase.tasks_done}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Takenlijst</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Taak
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Fase
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-2">{task.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{task.phase}</td>
                    <td className="px-4 py-2 text-muted-foreground">{task.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Weekly-specific sections */}
      {report.type === "weekly" && (
        <>
          {completedThisWeek.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Voltooid deze week</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {completedThisWeek.map((item, i) => (
                    <li key={i} className="text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {planNextWeek.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Plan volgende week</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {planNextWeek.map((item, i) => (
                    <li key={i} className="text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Completion-specific sections */}
      {report.type === "completion" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tijdlijn</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Gepland</p>
                  <p className="mt-1">{formatDate(data.planned_end_date ?? null)}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Werkelijk</p>
                  <p className="mt-1">{formatDate(data.actual_end_date ?? null)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Budget vs Kosten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Budget</p>
                  <p className="mt-1">{formatMoney(data.budget_cents ?? 0)}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Werkelijke kosten</p>
                  <p className="mt-1">{formatMoney(data.actual_cost_cents ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <a
          href={`/api/v1/reports/${report.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button>Download PDF</Button>
        </a>

        <Button
          variant="outline"
          onClick={handleShare}
          disabled={sharing}
        >
          <Share2 className="mr-1.5 h-4 w-4" />
          Deel rapport
        </Button>

        {shareUrl && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/80"
            onClick={() => navigator.clipboard.writeText(shareUrl).catch(() => {})}
          >
            <Copy className="h-3.5 w-3.5" />
            {shareUrl}
          </button>
        )}
      </div>
    </div>
  );
}
