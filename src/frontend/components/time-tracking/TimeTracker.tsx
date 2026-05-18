"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listProjectProcesses,
  startTimer,
  stopTimer,
  listTimeEntries,
} from "@/lib/time-tracking";
import type { ProjectProcessResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Exported duration formatter (also tested directly)
// ---------------------------------------------------------------------------

export function formatTotalDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h} u ${m} min`;
  }
  return `${m} min`;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// ProcessRow — one row per project process
// ---------------------------------------------------------------------------

interface ProcessRowProps {
  pp: ProjectProcessResponse;
}

function ProcessRow({ pp }: ProcessRowProps) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing total on mount
  useEffect(() => {
    listTimeEntries(pp.id)
      .then((res) => setTotalSeconds(res.total_seconds))
      .catch(() => {/* silently ignore per-row errors */});
  }, [pp.id]);

  // Live ticker
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  async function handleStart() {
    setError(null);
    try {
      await startTimer(pp.id, undefined);
      setElapsed(0);
      setRunning(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleStopClick() {
    setShowNotes(true);
  }

  async function handleStopConfirm() {
    setError(null);
    try {
      await stopTimer(pp.id, notes || undefined);
      setRunning(false);
      setShowNotes(false);
      setNotes("");
      // Refresh totals
      const res = await listTimeEntries(pp.id);
      setTotalSeconds(res.total_seconds);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{pp.process.name}</span>
        <div className="flex items-center gap-2">
          {running && (
            <span className="text-sm font-mono text-blue-600">{formatElapsed(elapsed)}</span>
          )}
          {!running && !showNotes && (
            <Button size="sm" onClick={handleStart}>
              Starten
            </Button>
          )}
          {running && !showNotes && (
            <Button size="sm" variant="destructive" onClick={handleStopClick}>
              Stoppen
            </Button>
          )}
        </div>
      </div>

      {showNotes && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Notities (optioneel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleStopConfirm}>
            Opslaan
          </Button>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Totaal: {formatTotalDuration(totalSeconds)}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimeTracker — main widget
// ---------------------------------------------------------------------------

interface TimeTrackerProps {
  projectId: string;
}

export default function TimeTracker({ projectId }: TimeTrackerProps) {
  const [processes, setProcesses] = useState<ProjectProcessResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjectProcesses(projectId)
      .then((res) => setProcesses(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Tijdregistratie</h2>
      {processes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen processen gekoppeld aan dit project.</p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Processen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {processes.map((pp) => (
              <ProcessRow key={pp.id} pp={pp} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
