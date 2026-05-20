"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Share2, Copy, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ReportResponse, ReportShareResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const ACCESS_TOKEN_KEY = "foreman_access_token";

function formatDate(iso: string): string {
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
// Report data renderer
// ---------------------------------------------------------------------------

function ReportPreview({ data }: { data: Record<string, unknown> }) {
  const project = data.project as Record<string, unknown> | undefined;
  const period = data.period as Record<string, string | null> | undefined;
  const totals = data.totals as Record<string, number> | undefined;
  const phases = (data.phases as Record<string, unknown>[]) ?? [];
  const tasks = (data.tasks as Record<string, unknown>[]) ?? [];

  // Weekly-specific
  const completed = (data.completed_this_week as Record<string, unknown>[]) ?? [];
  const hoursByPhase = (data.hours_by_phase as Record<string, unknown>[]) ?? [];

  // Completion-specific
  const timeline = data.timeline as Record<string, unknown> | undefined;
  const costsVsBudget = data.costs_vs_budget as Record<string, unknown> | undefined;
  const phaseSummary = (data.phase_summary as Record<string, unknown>[]) ?? [];

  const reportType = data.type as string | undefined;

  return (
    <div className="space-y-6">
      {/* Project info */}
      {project && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {project.name as string}
          </h2>
          {project.description ? (
            <p className="text-sm text-muted-foreground mt-1">
              {String(project.description)}
            </p>
          ) : null}
          {period && (period.start || period.end) && (
            <p className="text-sm text-muted-foreground mt-1">
              Periode: {period.start ?? "—"} → {period.end ?? "—"}
            </p>
          )}
        </div>
      )}

      {/* KPIs */}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Taken</p>
              <p className="text-xl font-bold text-foreground">{totals.task_count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Afgerond</p>
              <p className="text-xl font-bold text-foreground">
                {totals.completed_task_count}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Uren</p>
              <p className="text-xl font-bold text-foreground">
                {(totals.estimated_hours ?? 0).toFixed(1)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Arbeidskosten</p>
              <p className="text-xl font-bold text-foreground">
                {formatMoney(totals.labor_cost_cents ?? 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Completion: timeline */}
      {reportType === "completion" && timeline && (
        <>
          <h3 className="font-semibold text-foreground">Tijdlijn</h3>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground" />
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Start</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Eind</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Dagen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-2 font-medium">Gepland</td>
                    <td className="px-4 py-2 text-muted-foreground">{(timeline.planned_start as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{(timeline.planned_end as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{String(timeline.planned_duration_days ?? "—")}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">Werkelijk</td>
                    <td className="px-4 py-2 text-muted-foreground">{(timeline.actual_start as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{(timeline.actual_end as string) ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{String(timeline.actual_duration_days ?? "—")}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Completion: costs vs budget */}
      {reportType === "completion" && costsVsBudget && (
        <>
          <h3 className="font-semibold text-foreground">Kosten vs Budget</h3>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="font-bold">{formatMoney(costsVsBudget.budget_cents as number)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Werkelijk</p>
                  <p className="font-bold">{formatMoney(costsVsBudget.actual_cost_cents as number)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Verschil</p>
                  <p className={`font-bold ${(costsVsBudget.over_budget as boolean) ? "text-destructive" : "text-green-600"}`}>
                    {formatMoney(costsVsBudget.variance_cents as number)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Completion: phase summary */}
      {reportType === "completion" && phaseSummary.length > 0 && (
        <>
          <h3 className="font-semibold text-foreground">Fase overzicht</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Fase</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Taken</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Afgerond</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Kosten</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {phaseSummary.map((p, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{p.phase_name as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{p.status as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{String(p.task_count)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{String(p.completed_task_count)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(p.actual_cost_cents as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Weekly: completed this week */}
      {reportType === "weekly" && completed.length > 0 && (
        <>
          <h3 className="font-semibold text-foreground">Afgerond deze week</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Taak</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Fase</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Uren</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Kosten</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {completed.map((t, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{t.name as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{t.phase_name as string}</td>
                        <td className="px-4 py-2 text-right">{(t.estimated_hours as number).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(t.labor_cost_cents as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Weekly: hours by phase */}
      {reportType === "weekly" && hoursByPhase.length > 0 && (
        <>
          <h3 className="font-semibold text-foreground">Uren per fase</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Fase</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Taken</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Uren</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Kosten</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hoursByPhase.map((p, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{p.phase_name as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{String(p.task_count)}</td>
                        <td className="px-4 py-2 text-right">{(p.estimated_hours as number).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(p.labor_cost_cents as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Generic: phases list (fallback for basic report data) */}
      {!reportType && phases.length > 0 && (
        <>
          <h3 className="font-semibold text-foreground">Fasen</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Fase</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Taken</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {phases.map((p, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{p.name as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{p.status as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{String(p.task_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Tasks list */}
      {tasks.length > 0 && (
        <>
          <h3 className="font-semibold text-foreground">Taken</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Taak</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Uren</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Kosten</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tasks.map((t, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{t.name as string}</td>
                        <td className="px-4 py-2 text-muted-foreground">{t.status as string}</td>
                        <td className="px-4 py-2 text-right">{(t.estimated_hours as number).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(t.labor_cost_cents as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Share state
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch<ReportResponse>(`/reports/${reportId}`)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [reportId]);

  async function handleDownloadPdf() {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(ACCESS_TOKEN_KEY)
        : null;
    const res = await fetch(`${API_BASE}/reports/${reportId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError("PDF downloaden mislukt.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${reportId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleToggleShare() {
    setSharing(true);
    try {
      const result = await apiFetch<ReportShareResponse>(
        `/reports/${reportId}/share`,
        { method: "POST" }
      );
      setReport((prev) =>
        prev
          ? {
              ...prev,
              is_shared: !!result.share_token,
              share_token: result.share_token,
            }
          : prev
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delen mislukt");
    } finally {
      setSharing(false);
    }
  }

  function handleCopyLink() {
    if (!report?.share_token) return;
    const shareUrl = `${window.location.origin}/report/${report.share_token}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!report) {
    return <p className="text-sm text-muted-foreground">Rapport niet gevonden.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/reports")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{report.title}</h1>
            <p className="text-sm text-muted-foreground">{formatDate(report.created_at)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="mr-1.5 h-4 w-4" />
            PDF downloaden
          </Button>
          <Button
            variant={report.is_shared ? "default" : "outline"}
            size="sm"
            onClick={handleToggleShare}
            disabled={sharing}
          >
            <Share2 className="mr-1.5 h-4 w-4" />
            {report.is_shared ? "Delen uitschakelen" : "Delen"}
          </Button>
        </div>
      </div>

      {/* Share link */}
      {report.is_shared && report.share_token && (
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <p className="text-sm text-muted-foreground flex-1 truncate">
              {window.location.origin}/report/{report.share_token}
            </p>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Gekopieerd
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Link kopiëren
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report content */}
      <ReportPreview data={report.data} />
    </div>
  );
}
