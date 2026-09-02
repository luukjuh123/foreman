"use client";

import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Exported duration formatter (also tested directly)
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
// Types
// ---------------------------------------------------------------------------

interface TimeEntry {
  id: string;
  project_process_id: string;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

interface TimeEntriesResponse {
  data: TimeEntry[];
  total_seconds: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimeTrackerProps {
  projectProcessId: string;
  processName: string;
  onUpdate?: () => void;
}

// ---------------------------------------------------------------------------
// TimeTracker component
// ---------------------------------------------------------------------------

export default function TimeTracker({
  projectProcessId,
  processName,
  onUpdate,
}: TimeTrackerProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runningEntry = entries.find((e) => e.stopped_at === null);
  const isRunning = runningEntry !== undefined;

  async function loadEntries() {
    try {
      const res = await apiFetch<TimeEntriesResponse>(
        `/time-tracking/${projectProcessId}`
      );
      setEntries(res.data);
      setTotalSeconds(res.total_seconds);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectProcessId]);

  // Live ticker
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  async function handleStart() {
    setError(null);
    try {
      await apiFetch(`/time-tracking/${projectProcessId}/start`, {
        method: "POST",
        body: JSON.stringify({ notes: notes || null }),
      });
      await loadEntries();
      onUpdate?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleStop() {
    setError(null);
    try {
      await apiFetch(`/time-tracking/${projectProcessId}/stop`, {
        method: "POST",
      });
      await loadEntries();
      onUpdate?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const completedEntries = entries.filter((e) => e.stopped_at !== null);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{processName}</span>
        {isRunning && (
          <span className="text-sm font-mono text-blue-600">
            {formatDuration(elapsed)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Opmerkingen"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 rounded border px-2 py-1 text-sm"
        />
        {!isRunning ? (
          <button
            onClick={handleStart}
            className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
          >
            Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="rounded bg-destructive px-3 py-1 text-sm text-destructive-foreground"
          >
            Stop
          </button>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Totale tijd: {formatDuration(totalSeconds)}
      </div>

      {completedEntries.length > 0 && (
        <ul className="space-y-1">
          {completedEntries.map((entry) => (
            <li key={entry.id} className="text-xs text-muted-foreground">
              {formatDuration(entry.duration_seconds ?? 0)}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
