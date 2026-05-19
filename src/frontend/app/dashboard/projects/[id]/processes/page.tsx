"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Image as ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/projects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectProcessResponse {
  id: string;
  project_id: string;
  process_id: string;
  notes: string | null;
  created_at: string;
  process: ProcessResponse;
}

interface TimeEntryResponse {
  id: string;
  project_process_id: string;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

interface TimeEntryListResponse {
  data: TimeEntryResponse[];
  total_seconds: number;
}

interface PhotoResponse {
  id: string;
  project_id: string;
  recognized_process_id: string | null;
  recognized_process_slug: string | null;
  image_url: string;
  completion_pct: number | null;
  reasoning: string | null;
  created_at: string;
}

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
// Time entry item
// ---------------------------------------------------------------------------

function TimeEntryItem({ entry }: { entry: TimeEntryResponse }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {formatDate(entry.started_at)}
          {entry.stopped_at ? ` → ${formatDate(entry.stopped_at)}` : " (loopt)"}
        </span>
        <span className="font-medium tabular-nums">
          {formatDuration(entry.duration_seconds)}
        </span>
      </div>
      {entry.notes && (
        <span className="text-xs text-muted-foreground">{entry.notes}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process card
// ---------------------------------------------------------------------------

interface ProcessCardProps {
  pp: ProjectProcessResponse;
  timeEntries: TimeEntryResponse[];
  totalSeconds: number;
  photos: PhotoResponse[];
}

function ProcessCard({ pp, timeEntries, totalSeconds, photos }: ProcessCardProps) {
  const processPhotos = photos.filter(
    (p) => p.recognized_process_id === pp.process_id
  );

  return (
    <Card>
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

      <CardContent className="space-y-4">
        {/* Time entries */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Tijdsregistraties</span>
          </div>
          {timeEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Geen tijdregistraties.</p>
          ) : (
            <div className="space-y-1.5">
              {timeEntries.map((entry) => (
                <TimeEntryItem key={entry.id} entry={entry} />
              ))}
              <div className="flex justify-end pt-1 text-sm">
                <span className="text-muted-foreground mr-2">Totaal:</span>
                <span className="font-semibold">{formatDuration(totalSeconds)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Photos */}
        {processPhotos.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Foto&apos;s</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {processPhotos.map((photo) => (
                <div key={photo.id} className="relative">
                  <img
                    src={photo.image_url}
                    alt={`Foto ${pp.process.name}`}
                    className="h-20 w-20 rounded-md object-cover border"
                  />
                  {photo.completion_pct != null && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                      {photo.completion_pct}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);

      Promise.all([
        apiFetch<{ data: ProjectProcessResponse[] }>(`/processes/projects/${id}`),
        apiFetch<{ data: PhotoResponse[] }>(`/photos/projects/${id}`),
      ])
        .then(async ([processesRes, photosRes]) => {
          const sorted = [...processesRes.data].sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          setPhotos(photosRes.data);

          // Fetch time entries for each process in parallel
          const timeResults = await Promise.all(
            sorted.map((pp) =>
              apiFetch<TimeEntryListResponse>(`/time-tracking/${pp.id}`)
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
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Procesgeschiedenis</h1>
      </div>

      {/* Process list */}
      <div className="space-y-4">
        {processes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen processen gekoppeld aan dit project.
          </p>
        ) : (
          processes.map((pp) => (
            <ProcessCard
              key={pp.id}
              pp={pp}
              timeEntries={timeEntriesMap[pp.id]?.data ?? []}
              totalSeconds={timeEntriesMap[pp.id]?.total_seconds ?? 0}
              photos={photos}
            />
          ))
        )}
      </div>
    </div>
  );
}
