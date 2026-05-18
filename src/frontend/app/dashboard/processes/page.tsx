"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listProcesses,
  listProcessStats,
  formatDuration,
} from "@/lib/processes";
import type { ProcessResponse, ProcessStatsResponse } from "@/lib/processes";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProcessLibraryPage() {
  const [processes, setProcesses] = useState<ProcessResponse[]>([]);
  const [stats, setStats] = useState<Map<string, ProcessStatsResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listProcesses(), listProcessStats()])
      .then(([procList, statsList]) => {
        setProcesses(procList.data);
        const statsMap = new Map<string, ProcessStatsResponse>(
          statsList.data.map((s) => [s.process_id, s])
        );
        setStats(statsMap);
      })
      .catch((err: Error) => setError(err.message ?? "Onbekende fout"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Procesbibliotheek</h1>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Fout: {error}</p>
      ) : processes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen processen gevonden.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {processes.map((process) => {
            const s = stats.get(process.id);
            return (
              <Card key={process.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{process.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{process.slug}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {process.description && (
                    <p className="text-muted-foreground line-clamp-2">
                      {process.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Eenheid: {process.unit}</span>
                    <span>
                      Gem. duur:{" "}
                      <span className="font-medium text-foreground">
                        {formatDuration(s?.avg_seconds ?? null)}
                      </span>
                    </span>
                    <span>
                      Projecten:{" "}
                      <span className="font-medium text-foreground">
                        {s ? s.project_count : "–"}
                      </span>
                    </span>
                    <span>
                      Totale tijd:{" "}
                      <span className="font-medium text-foreground">
                        {formatDuration(s?.total_seconds ?? null)}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
