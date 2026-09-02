"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcPhaseProgress } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import type { PhaseResponse, TaskResponse } from "@/lib/types";
import type { SubcontractorResponse, SubcontractorListResponse } from "@/lib/subcontractors";
import TimeTracker from "@/components/time-tracking/TimeTracker";
import PunchListTab from "@/components/punch-list/PunchListTab";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Te doen",
  in_progress: "Bezig",
  done: "Klaar",
  blocked: "Geblokkeerd",
};

const TASK_STATUS_CLASS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
};

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task }: { task: TaskResponse }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/40">
      <span className="text-sm">{task.name}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          TASK_STATUS_CLASS[task.status] ?? "bg-gray-100 text-gray-600"
        )}
      >
        {TASK_STATUS_LABELS[task.status] ?? task.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcontractor picker dialog
// ---------------------------------------------------------------------------

interface SubcontractorPickerProps {
  phaseId: string;
  onClose: () => void;
}

function SubcontractorPicker({ phaseId, onClose }: SubcontractorPickerProps) {
  const [subs, setSubs] = useState<SubcontractorResponse[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rateEuros, setRateEuros] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<SubcontractorListResponse>("/subcontractors/?page=1&per_page=100")
      .then((res) => setSubs(res.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const hourly_rate_cents = rateEuros
        ? Math.round(parseFloat(rateEuros) * 100)
        : undefined;
      await apiFetch(`/subcontractors/assignments/phase/${phaseId}`, {
        method: "POST",
        body: JSON.stringify({ subcontractor_id: selectedId, hourly_rate_cents }),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Onderaannemer toewijzen</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : (
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label htmlFor="sub-picker-select" className="mb-1 block text-sm font-medium">
                Onderaannemer
              </label>
              <select
                id="sub-picker-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="" disabled>
                  Selecteer onderaannemer
                </option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedId && (
              <div>
                <label htmlFor="sub-picker-rate" className="mb-1 block text-sm font-medium">
                  Tarief voor deze fase (€/uur)
                </label>
                <input
                  id="sub-picker-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateEuros}
                  onChange={(e) => setRateEuros(e.target.value)}
                  placeholder="75.00"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuleren
              </Button>
              <Button type="submit" disabled={saving || !selectedId}>
                {saving ? "Toewijzen…" : "Toewijzen"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase card (expandable)
// ---------------------------------------------------------------------------

function PhaseCard({ phase }: { phase: PhaseResponse }) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const progress = calcPhaseProgress(phase);
  const done = phase.tasks.filter((t) => t.status === "done").length;
  const total = phase.tasks.length;

  return (
    <>
      <Card>
        <CardHeader
          className="cursor-pointer select-none pb-2"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <CardTitle className="text-base">{phase.name}</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">
              {done}/{total} taken
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-1.5 pt-0">
            {phase.tasks.length > 0 && phase.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}

            {/* Subcontractor assignment button */}
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen(true);
                }}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Onderaannemer toewijzen
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {pickerOpen && (
        <SubcontractorPicker
          phaseId={phase.id}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overzicht Tab
// ---------------------------------------------------------------------------

interface OverzichtTabProps {
  project: {
    id: string;
    phases: PhaseResponse[];
  };
}

export function OverzichtTab({ project }: OverzichtTabProps) {
  return (
    <div className="space-y-6">
      {/* Punch list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Nakijklijst</h2>
        <PunchListTab projectId={project.id} />
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Fases</h2>
        {project.phases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen fases toegevoegd.</p>
        ) : (
          project.phases.map((phase) => <PhaseCard key={phase.id} phase={phase} />)
        )}
      </div>

      {/* Time tracking */}
      <TimeTracker projectId={project.id} />
    </div>
  );
}
