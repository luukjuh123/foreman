"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listProjectProcesses, listTimeEntries, listProjectPhotos } from "@/lib/process-timeline";
import { formatDate } from "@/lib/projects";
import type {
  ProjectProcessResponse,
  TimeEntryResponse,
  TimeEntryListResponse,
  PhotoResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Duration helper
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds === 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}u ${m}min` : `${h}u`;
}

// ---------------------------------------------------------------------------
// Day key (yyyy-mm-dd) → Dutch display (dd-MM-yyyy)
// ---------------------------------------------------------------------------

function dayKey(iso: string): string {
  return iso.split("T")[0];
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Photo strip
// ---------------------------------------------------------------------------

function PhotoStrip({ photos }: { photos: PhotoResponse[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          <img
            src={photo.image_url}
            alt={`Foto ${photo.recognized_process_slug ?? ""}`}
            className="h-20 w-20 rounded-md object-cover border"
          />
          {photo.completion_pct != null && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
              {photo.completion_pct}%
            </span>
          )}
          {photo.recognized_process_slug && (
            <span className="block text-[10px] text-center text-muted-foreground mt-0.5 truncate max-w-[80px]">
              {photo.recognized_process_slug}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline entry card
// ---------------------------------------------------------------------------

interface TimelineEntryProps {
  pp: ProjectProcessResponse;
  entries: TimeEntryResponse[];
  totalSeconds: number;
  photos: PhotoResponse[];
}

function TimelineEntry({ pp, entries, totalSeconds, photos }: TimelineEntryProps) {
  const processPhotos = photos.filter(
    (p) => p.recognized_process_id === pp.process_id
  );

  return (
    <div className="relative pl-6 border-l-2 border-muted">
      {/* dot */}
      <span className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-background" />

      <Card className="mb-0">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{pp.process.name}</CardTitle>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {pp.process.slug}
            </span>
          </div>
          {pp.notes && (
            <p className="text-sm text-muted-foreground mt-1">{pp.notes}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-2">
          {entries.length > 0 && (
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Duur
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatDuration(entry.duration_seconds)}
                    </span>
                  </div>
                  {entry.notes && (
                    <span className="text-xs text-muted-foreground">{entry.notes}</span>
                  )}
                </div>
              ))}
              {totalSeconds > 0 && (
                <div className="flex justify-end pt-1 text-sm">
                  <span className="text-muted-foreground mr-2">Totaal:</span>
                  <span className="font-semibold">{formatDuration(totalSeconds)}</span>
                </div>
              )}
            </div>
          )}

          <PhotoStrip photos={processPhotos} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  processes: ProjectProcessResponse[];
  timeEntriesMap: Record<string, TimeEntryListResponse>;
}

function SummaryCard({ processes, timeEntriesMap }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Overzicht per proces</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {processes.map((pp) => {
            const total = timeEntriesMap[pp.id]?.total_seconds ?? 0;
            return (
              <div key={pp.id} className="flex items-center justify-between text-sm">
                <span>{pp.process.name}</span>
                <span className="font-medium tabular-nums">{formatDuration(total)}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProcessTimelinePage({ params }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [processes, setProcesses] = useState<ProjectProcessResponse[]>([]);
  const [timeEntriesMap, setTimeEntriesMap] = useState<
    Record<string, TimeEntryListResponse>
  >({});
  const [photos, setPhotos] = useState<PhotoResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);

      Promise.all([
        listProjectProcesses(id),
        listProjectPhotos(id),
      ])
        .then(async ([processesRes, photosRes]) => {
          const sorted = [...processesRes.data].sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setPhotos(photosRes.data);

          const timeResults = await Promise.all(
            sorted.map((pp) =>
              listTimeEntries(pp.id)
                .then((res) => ({ id: pp.id, res }))
                .catch(() => ({
                  id: pp.id,
                  res: { data: [], total_seconds: 0 } as TimeEntryListResponse,
                }))
            )
          );

          const map: Record<string, TimeEntryListResponse> = {};
          for (const { id: ppId, res } of timeResults) {
            map[ppId] = res;
          }
          setTimeEntriesMap(map);
          setProcesses(sorted);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/projects/${projectId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  // Group entries by day (newest first)
  const grouped: Record<string, ProjectProcessResponse[]> = {};
  for (const pp of processes) {
    const key = dayKey(pp.created_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(pp);
  }
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href={`/dashboard/projects/${projectId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar project
        </Button>
      </Link>

      {/* Header */}
      <h1 className="text-2xl font-bold text-foreground">Tijdlijn</h1>

      {processes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen activiteiten gevonden.</p>
      ) : (
        <>
          {/* Summary card */}
          <SummaryCard processes={processes} timeEntriesMap={timeEntriesMap} />

          {/* Timeline grouped by day */}
          <div className="space-y-8">
            {days.map((day) => (
              <div key={day} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {dayLabel(day)}
                </h2>
                <div className="space-y-4">
                  {grouped[day].map((pp) => (
                    <TimelineEntry
                      key={pp.id}
                      pp={pp}
                      entries={timeEntriesMap[pp.id]?.data ?? []}
                      totalSeconds={timeEntriesMap[pp.id]?.total_seconds ?? 0}
                      photos={photos}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
