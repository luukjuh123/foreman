"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { ReportResponse, ReportListResponse, ProjectListResponse } from "@/lib/types";

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
  return `/reports?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportHistoryPage() {
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project list for filter dropdown
  useEffect(() => {
    apiFetch<ProjectListResponse>("/projects?page=1&per_page=100")
      .then((res) => {
        setProjects(res.data.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {
        // Filter is best-effort; don't surface project-list errors
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<ReportListResponse>(buildUrl(page, projectId))
      .then((res) => {
        setReports(res.data);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, projectId]);

  const totalPages = Math.ceil(total / perPage);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function handleProjectFilter(id: string) {
    setProjectId(id);
    setPage(1);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Rapporthistorie</h1>
      </div>

      {/* Project filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="project-filter" className="text-sm text-muted-foreground">
          Project:
        </label>
        <select
          id="project-filter"
          value={projectId}
          onChange={(e) => handleProjectFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
                      Periode
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Aangemaakt
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Acties
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((report) => (
                    <tr
                      key={report.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/dashboard/reports/${report.id}`}
                          className="text-foreground hover:underline"
                        >
                          {report.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            TYPE_BADGE_CLASS[report.type] ?? "bg-gray-100 text-gray-700"
                          )}
                        >
                          {TYPE_LABELS[report.type] ?? report.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {report.period_start && report.period_end
                          ? `${formatDate(report.period_start)} – ${formatDate(report.period_end)}`
                          : "–"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(report.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/reports/${report.id}`}>
                            <Button variant="outline" size="sm">
                              Bekijk
                            </Button>
                          </Link>
                          <a
                            href={`/api/v1/reports/${report.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm">
                              PDF
                            </Button>
                          </a>
                        </div>
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
