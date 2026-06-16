"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  UserPlus,
  X,
  Receipt,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  FileText,
  Users,
  Wallet,
  TrendingUp,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getProject,
  calcPhaseProgress,
  calcTaskSummary,
  formatBudget,
  formatDate,
} from "@/lib/projects";
import type {
  ProjectResponse,
  PhaseResponse,
  TaskResponse,
} from "@/lib/types";
import { apiFetch } from "@/lib/api";
import type {
  SubcontractorResponse,
  SubcontractorListResponse,
} from "@/lib/subcontractors";
import TimeTracker from "@/components/time-tracking/TimeTracker";
import PunchListTab from "@/components/punch-list/PunchListTab";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  active: "Actief",
  completed: "Voltooid",
  archived: "Gearchiveerd",
};

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; border: string }
> = {
  draft: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
    dot: "bg-gray-400",
    border: "border-gray-300 dark:border-gray-600",
  },
  active: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-300 dark:border-emerald-700",
  },
  completed: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    border: "border-blue-300 dark:border-blue-700",
  },
  archived: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-300 dark:border-amber-700",
  },
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Te doen",
  in_progress: "Bezig",
  done: "Klaar",
  blocked: "Geblokkeerd",
};

const TASK_STATUS_CLASS: Record<string, string> = {
  todo: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  in_progress: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  done: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  blocked: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
};

// ---------------------------------------------------------------------------
// Project hero section
// ---------------------------------------------------------------------------

function ProjectHero({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const progressPercent =
    summary.total > 0
      ? Math.round((summary.done / summary.total) * 100)
      : 0;
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter(
    (p) => p.status === "completed" || p.status === "done"
  ).length;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const customerName = (project as { customer_name?: string }).customer_name;

  // Days remaining
  const daysRemaining = project.end_date
    ? Math.ceil(
        (new Date(project.end_date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const metrics = [
    {
      label: "Voortgang",
      value: `${progressPercent}%`,
      sublabel: `${summary.done}/${summary.total} taken`,
      icon: BarChart3,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Fases",
      value: `${donePhases}/${totalPhases}`,
      sublabel: "voltooid",
      icon: LayoutGrid,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Budget",
      value:
        project.budget_cents != null
          ? formatBudget(project.budget_cents)
          : "—",
      sublabel: "totaal",
      icon: Wallet,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Deadline",
      value:
        daysRemaining !== null
          ? daysRemaining > 0
            ? `${daysRemaining}d`
            : daysRemaining === 0
              ? "Vandaag"
              : `${Math.abs(daysRemaining)}d over`
          : "—",
      sublabel: project.end_date ? formatDate(project.end_date) : "",
      icon:
        daysRemaining !== null && daysRemaining < 0
          ? AlertTriangle
          : Clock,
      color:
        daysRemaining !== null && daysRemaining < 0
          ? "text-red-500"
          : daysRemaining !== null && daysRemaining <= 7
            ? "text-amber-500"
            : "text-muted-foreground",
      bg:
        daysRemaining !== null && daysRemaining < 0
          ? "bg-red-500/10"
          : daysRemaining !== null && daysRemaining <= 7
            ? "bg-amber-500/10"
            : "bg-muted/50",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Title + status + quick actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] md:text-[32px] font-extrabold tracking-tight text-foreground leading-none">
              {project.name}
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                statusCfg.bg,
                statusCfg.text,
                statusCfg.border
              )}
            >
              <span
                className={cn("h-2 w-2 rounded-full", statusCfg.dot)}
              />
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>

          {project.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">
              {project.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {customerName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1">
                <Users className="h-3 w-3" />
                {customerName}
              </span>
            )}
            {(project.start_date || project.end_date) && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1">
                <Calendar className="h-3 w-3" />
                {formatDate(project.start_date)} –{" "}
                {formatDate(project.end_date)}
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/dashboard/invoices/new?project_id=${project.id}&project_name=${encodeURIComponent(project.name)}`}>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Receipt className="h-3.5 w-3.5" />
              Factuur
            </Button>
          </Link>
          <Link href={`/dashboard/reports?project_id=${project.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Rapport
            </Button>
          </Link>
        </div>
      </div>

      {/* Progress bar — full width */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">
            {progressPercent}% voltooid
          </span>
          <span className="text-muted-foreground">
            {summary.done} van {summary.total} taken
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-700"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card
            key={m.label}
            className="border-0 shadow-sm overflow-hidden"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    m.bg
                  )}
                >
                  <m.icon className={cn("h-4.5 w-4.5", m.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground/70 truncate">
                    {m.label}
                  </p>
                  <p className="text-xl font-extrabold tracking-tight leading-tight">
                    {m.value}
                  </p>
                  {m.sublabel && (
                    <p className="text-[10px] text-muted-foreground">
                      {m.sublabel}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sub-page navigation tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/50 pb-px">
        {[
          {
            label: "Takenbord",
            href: `/dashboard/projects/${project.id}/board`,
          },
          {
            label: "Gantt",
            href: `/dashboard/projects/${project.id}/gantt`,
          },
          {
            label: "Processen",
            href: `/dashboard/projects/${project.id}/processes`,
          },
          {
            label: "Tijdlijn",
            href: `/dashboard/projects/${project.id}/timeline`,
          },
          {
            label: "Uren",
            href: `/dashboard/projects/${project.id}/time-tracking`,
          },
        ].map((tab) => (
          <Link key={tab.href} href={tab.href}>
            <button className="rounded-lg px-3.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
              {tab.label}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task }: { task: TaskResponse }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <span className="text-sm font-medium">{task.name}</span>
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          TASK_STATUS_CLASS[task.status] ?? TASK_STATUS_CLASS.todo
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

  useEffect(() => {
    apiFetch<SubcontractorListResponse>(
      "/subcontractors/?page=1&per_page=100"
    )
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
        body: JSON.stringify({
          subcontractor_id: selectedId,
          hourly_rate_cents,
        }),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Onderaannemer toewijzen</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : (
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label
                htmlFor="sub-picker-select"
                className="mb-1.5 block text-sm font-medium"
              >
                Onderaannemer
              </label>
              <select
                id="sub-picker-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                <label
                  htmlFor="sub-picker-rate"
                  className="mb-1.5 block text-sm font-medium"
                >
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
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuleren
              </Button>
              <Button type="submit" disabled={saving || !selectedId}>
                {saving ? "Toewijzen..." : "Toewijzen"}
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
      <Card className="overflow-hidden">
        <CardHeader
          className="cursor-pointer select-none pb-2 hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <CardTitle className="text-sm font-bold">
                {phase.name}
              </CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-foreground">
                {progress}%
              </span>
              <span className="text-xs text-muted-foreground">
                {done}/{total} taken
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted/40">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-1.5 pt-0">
            {phase.tasks.length > 0 &&
              phase.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}

            {/* Subcontractor assignment button */}
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen(true);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
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
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      getProject(id)
        .then(setProject)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        </Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? "Project niet gevonden."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link href="/dashboard/projects">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Projecten
        </Button>
      </Link>

      {/* Hero section */}
      <ProjectHero project={project} />

      {/* Punch list */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Nakijklijst</h2>
        <PunchListTab projectId={project.id} />
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Fases</h2>
        {project.phases.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutGrid className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Geen fases toegevoegd.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {project.phases.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} />
            ))}
          </div>
        )}
      </div>

      {/* Time tracking */}
      <TimeTracker projectId={project.id} />
    </div>
  );
}
