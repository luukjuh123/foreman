"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type {
  ProjectListResponse,
  ProjectResponse,
  ReportGenerateRequest,
  ReportResponse,
  ReportShareResponse,
} from "@/lib/types";

// Inline label component to avoid missing shadcn dependency
function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ReportType = "weekly" | "completion";

export default function ReportBuilderPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [reportType, setReportType] = useState<ReportType>("weekly");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    apiFetch<ProjectListResponse>("/projects?page=1&per_page=100")
      .then((res) => setProjects(res.data))
      .catch(() => {});
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setReport(null);
    setShareUrl(null);

    const body: ReportGenerateRequest = {
      project_id: selectedProjectId,
      type: reportType,
    };

    if (reportType === "weekly" && periodStart) {
      // week: start = selected Monday, end = Sunday (+6 days)
      const start = new Date(periodStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      body.period_start = periodStart;
      body.period_end = end.toISOString().split("T")[0];
    }

    try {
      const res = await apiFetch<ReportResponse>("/reports/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setReport(res);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPdf() {
    if (!report) return;
    await apiFetch(`/reports/${report.id}/pdf`, { method: "GET" });
  }

  async function handleShare() {
    if (!report) return;
    setSharing(true);
    try {
      const res = await apiFetch<ReportShareResponse>(
        `/reports/${report.id}/share`,
        { method: "POST" }
      );
      setShareUrl(res.share_url);
    } finally {
      setSharing(false);
    }
  }

  const data = report?.data ?? {};
  const taskCount = typeof data.task_count === "number" ? data.task_count : 0;
  const completedCount = typeof data.completed_count === "number" ? data.completed_count : 0;
  const totalHours = typeof data.total_hours === "number" ? data.total_hours : 0;
  const totalCostCents = typeof data.total_cost_cents === "number" ? data.total_cost_cents : 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Rapporten</h1>
      </div>

      {/* Builder card */}
      <Card>
        <CardHeader>
          <CardTitle>Rapport aanmaken</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Project selector */}
          <div className="space-y-1.5">
            <FieldLabel>Selecteer project</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    selectedProjectId === p.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {p.name}
                </button>
              ))}
              {projects.length === 0 && (
                <p className="text-sm text-muted-foreground">Geen projecten beschikbaar.</p>
              )}
            </div>
          </div>

          {/* Report type */}
          <div className="space-y-1.5">
            <FieldLabel>Rapporttype</FieldLabel>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReportType("weekly")}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  reportType === "weekly"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                Weekrapport
              </button>
              <button
                type="button"
                onClick={() => setReportType("completion")}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  reportType === "completion"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                Eindrapport
              </button>
            </div>
          </div>

          {/* Date picker — weekly only */}
          {reportType === "weekly" && (
            <div className="space-y-1.5">
              <FieldLabel htmlFor="period-start">Periode (startdatum week)</FieldLabel>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-48"
              />
            </div>
          )}

          {/* Generate button */}
          <div>
            {generating ? (
              <p className="text-sm text-muted-foreground">Bezig met genereren…</p>
            ) : (
              <Button onClick={handleGenerate} disabled={!selectedProjectId}>
                Genereer rapport
              </Button>
            )}
            {generateError && (
              <p className="mt-2 text-sm text-destructive">{generateError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview section */}
      {report && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">{report.title}</h2>

          {/* Period info */}
          {report.period_start && report.period_end && (
            <p className="text-sm text-muted-foreground">
              {formatDate(report.period_start)} — {formatDate(report.period_end)}
            </p>
          )}

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Taken" value={taskCount} />
            <KpiCard label="Voltooid" value={completedCount} />
            <KpiCard label="Uren" value={totalHours} />
            <KpiCard label="Kosten" value={formatMoney(totalCostCents)} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDownloadPdf}>
              Download PDF
            </Button>
            <Button variant="outline" onClick={handleShare} disabled={sharing}>
              Deel rapport
            </Button>
          </div>

          {/* Share URL */}
          {shareUrl && (
            <div className="rounded-md bg-muted px-4 py-3">
              <p className="text-sm font-medium">Deelbare link:</p>
              <p className="mt-1 break-all text-sm text-muted-foreground">{shareUrl}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
