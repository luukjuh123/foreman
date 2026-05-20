"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type {
  ReportSummaryResponse,
  ReportListResponse,
  ProjectListResponse,
  ProjectResponse,
  ReportGenerateRequest,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  weekly: "Wekelijks",
  completion: "Afronding",
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  weekly: "bg-blue-100 text-blue-700",
  completion: "bg-green-100 text-green-700",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

function buildUrl(page: number, projectId: string): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", "20");
  if (projectId) {
    params.set("project_id", projectId);
  }
  return `/reports/?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsListPage() {
  const [reports, setReports] = useState<ReportSummaryResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [projectFilter, setProjectFilter] = useState("");
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Builder form state
  const [showBuilder, setShowBuilder] = useState(false);
  const [genProject, setGenProject] = useState("");
  const [genType, setGenType] = useState<"weekly" | "completion">("weekly");
  const [genStart, setGenStart] = useState("");
  const [genEnd, setGenEnd] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Load projects for filter/builder dropdowns
  useEffect(() => {
    apiFetch<ProjectListResponse>("/projects/?page=1&per_page=100")
      .then((res) => setProjects(res.data))
      .catch(() => {});
  }, []);

  // Load reports list
  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<ReportListResponse>(buildUrl(page, projectFilter))
      .then((res) => {
        setReports(res.data);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, projectFilter]);

  const totalPages = Math.ceil(total / perPage);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  async function handleGenerate() {
    if (!genProject) {
      setGenError("Selecteer een project.");
      return;
    }
    setGenerating(true);
    setGenError(null);
    const body: ReportGenerateRequest = {
      project_id: genProject,
      type: genType,
      ...(genStart ? { period_start: genStart } : {}),
      ...(genEnd ? { period_end: genEnd } : {}),
    };
    try {
      await apiFetch("/reports/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setShowBuilder(false);
      setPage(1);
      // Reload list
      const res = await apiFetch<ReportListResponse>(buildUrl(1, projectFilter));
      setReports(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setGenerating(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Rapporten</h1>
        <Button size="sm" onClick={() => setShowBuilder((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nieuw rapport
        </Button>
      </div>

      {/* Report builder */}
      {showBuilder && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <h2 className="font-semibold text-foreground">Rapport genereren</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Project
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={genProject}
                  onChange={(e) => setGenProject(e.target.value)}
                >
                  <option value="">Selecteer project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Type
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={genType}
                  onChange={(e) =>
                    setGenType(e.target.value as "weekly" | "completion")
                  }
                >
                  <option value="weekly">Wekelijks</option>
                  <option value="completion">Afronding</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Startdatum (optioneel)
                </label>
                <Input
                  type="date"
                  value={genStart}
                  onChange={(e) => setGenStart(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">
                  Einddatum (optioneel)
                </label>
                <Input
                  type="date"
                  value={genEnd}
                  onChange={(e) => setGenEnd(e.target.value)}
                />
              </div>
            </div>

            {genError && (
              <p className="text-sm text-destructive">{genError}</p>
            )}

            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? "Genereren…" : "Rapport genereren"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBuilder(false)}
              >
                Annuleren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm font-medium text-muted-foreground">
          Filter op project:
        </label>
        <select
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Alle projecten</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen rapporten gevonden.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Titel
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Gedeeld
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((rep) => (
                    <tr
                      key={rep.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/reports/${rep.id}`}
                          className="text-foreground hover:underline flex items-center gap-1.5"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          {rep.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            TYPE_BADGE_CLASS[rep.type] ??
                              "bg-gray-100 text-gray-700"
                          )}
                        >
                          {TYPE_LABELS[rep.type] ?? rep.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(rep.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {rep.is_shared ? (
                          <span className="text-xs font-medium text-green-700">
                            Gedeeld
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} van {totalPages}
          </p>
          <div className="flex gap-2">
            {hasPrev && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
              >
                Vorige
              </Button>
            )}
            {hasNext && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Volgende
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
