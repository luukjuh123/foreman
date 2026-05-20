"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Timer } from "lucide-react";
import { listProjectProcesses, startTimer, stopTimer } from "@/lib/time-tracking";
import type { ProjectProcessResponse } from "@/lib/types";

interface Props {
  projectId: string;
}

export default function MobileTimeTracker({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [processes, setProcesses] = useState<ProjectProcessResponse[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    listProjectProcesses(projectId)
      .then((res) => {
        setProcesses(res.data);
        if (res.data.length > 0) setSelectedProcessId(res.data[0].id);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!activeEntryId) return;
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [activeEntryId]);

  const handleStart = useCallback(async () => {
    if (!selectedProcessId) return;
    setLoading(true);
    try {
      const entry = await startTimer(selectedProcessId);
      setActiveEntryId(entry.id);
      setElapsedSeconds(0);
    } finally {
      setLoading(false);
    }
  }, [selectedProcessId]);

  const handleStop = useCallback(async () => {
    if (!selectedProcessId) return;
    setLoading(true);
    try {
      await stopTimer(selectedProcessId);
      setActiveEntryId(null);
      setElapsedSeconds(0);
    } finally {
      setLoading(false);
    }
  }, [selectedProcessId]);

  function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }

  return (
    <>
      <button
        data-testid="mobile-timer-fab"
        onClick={() => setOpen((o) => !o)}
        className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Timer"
      >
        <Timer className="h-6 w-6" />
      </button>

      {open && (
        <div
          data-testid="mobile-timer-panel"
          className="md:hidden fixed bottom-36 right-4 z-40 w-72 rounded-xl border bg-card p-4 shadow-xl"
        >
          <h3 className="mb-3 font-semibold text-sm">Tijdregistratie</h3>

          {activeEntryId && (
            <p className="mb-3 text-center font-mono text-lg">{formatElapsed(elapsedSeconds)}</p>
          )}

          <select
            className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedProcessId}
            onChange={(e) => setSelectedProcessId(e.target.value)}
          >
            {processes.map((pp) => (
              <option key={pp.id} value={pp.id}>
                {pp.process.name}
              </option>
            ))}
          </select>

          {activeEntryId ? (
            <button
              data-testid="timer-stop-btn"
              onClick={handleStop}
              disabled={loading}
              className="w-full rounded-md bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              Stop
            </button>
          ) : (
            <button
              data-testid="timer-start-btn"
              onClick={handleStart}
              disabled={loading || !selectedProcessId}
              className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              Start
            </button>
          )}
        </div>
      )}
    </>
  );
}
