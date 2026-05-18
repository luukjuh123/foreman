"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Exported helper (also tested directly)
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimeTrackerProps {
  projectProcessId: string;
  processName: string;
  onUpdate?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimeTracker({
  projectProcessId,
  processName,
  onUpdate,
}: TimeTrackerProps) {
  const [entries, setEntries] = useState<TimeEntryResponse[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runningEntry = entries.find((e) => e.stopped_at === null) ?? null;
  const isRunning = runningEntry !== null;

  // Load entries on mount
  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectProcessId]);

  // Live timer
  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  async function loadEntries() {
    const token = getAccessToken();
    try {
      const res = await apiFetch<TimeEntryListResponse>(
        `/time-tracking/${projectProcessId}`,
        token ? { token } : {}
      );
      setEntries(res.data);
      setTotalSeconds(res.total_seconds);
    } catch {
      // ignore load errors silently — start/stop will surface failures
    }
  }

  async function handleStart() {
    setLoading(true);
    const token = getAccessToken();
    try {
      await apiFetch<TimeEntryResponse>(
        `/time-tracking/${projectProcessId}/start`,
        {
          method: "POST",
          body: JSON.stringify({ notes: notes || undefined }),
          ...(token ? { token } : {}),
        }
      );
      await loadEntries();
      onUpdate?.();
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    const token = getAccessToken();
    try {
      await apiFetch<TimeEntryResponse>(
        `/time-tracking/${projectProcessId}/stop`,
        {
          method: "POST",
          body: JSON.stringify({ notes: notes || undefined }),
          ...(token ? { token } : {}),
        }
      );
      await loadEntries();
      onUpdate?.();
    } finally {
      setLoading(false);
    }
  }

  const completedEntries = entries.filter((e) => e.stopped_at !== null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{processName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Notes input */}
        <Input
          placeholder="Opmerkingen (optioneel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
        />

        {/* Timer controls */}
        <div className="flex items-center gap-3">
          {isRunning ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                disabled={loading}
              >
                Stop
              </Button>
              <span className="text-sm font-mono text-muted-foreground">
                {formatDuration(elapsed)}
              </span>
            </>
          ) : (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleStart}
              disabled={loading}
            >
              Start
            </Button>
          )}
        </div>

        {/* Total */}
        {totalSeconds > 0 && (
          <p className="text-xs text-muted-foreground">
            Totale tijd:{" "}
            <span className="font-mono font-medium text-foreground">
              {formatDuration(totalSeconds)}
            </span>
          </p>
        )}

        {/* History */}
        {completedEntries.length > 0 && (
          <div className="space-y-1 pt-1">
            {completedEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>
                  {new Date(entry.started_at).toLocaleTimeString("nl-NL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-mono">
                  {entry.duration_seconds != null
                    ? formatDuration(entry.duration_seconds)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
