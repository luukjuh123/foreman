"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  UserPlus,
  X,
  Euro,
  ClipboardList,
  BarChart3,
  Clock,
  Layers,
  KanbanSquare,
  GitBranch,
  Timer,
  Receipt,
  FileText,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProject, calcPhaseProgress, formatBudget, formatDate } from "@/lib/projects";
import type { ProjectResponse, PhaseResponse, TaskResponse } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import type { SubcontractorResponse, SubcontractorListResponse } from "@/lib/subcontractors";
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

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  archived: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Te doen",
  in_progress: "Bezig",
  done: "Klaar",
  blocked: "Geblokkeerd",
};

const TASK_STATUS_CLASS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  done: "bg-green-500/10 text-green-600 dark:text-green-400",
  blocked: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task }: { task: TaskResponse }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{task.name}</span>
        {task.estimated_hours && (
          <span className="ml-2 text-xs text-muted-foreground">{task.estimated_hours}u</span>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
          TASK_STATUS_CLASS[task.status] ?? "bg-muted text-muted-foreground"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-card border p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Onderaannemer toewijzen</h2>
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
              <label htmlFor="sub-picker-select" className="mb-1 block text-sm font-medium">
                Onderaannemer
              </label>
              <select
                id="sub-picker-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-input bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  Tarief voor deze fase (EUR/uur)
                </label>
                <input
                  id="sub-picker-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateEuros}
                  onChange={(e) => setRateEuros(e.target.value)}
                  placeholder="75.00"
                  className="w-full rounded-lg border border-input bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

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
        <div
          className="cursor-pointer select-none p-4"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-semibold">{phase.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {done}/{total} taken
              </span>
              <span className="text-xs font-medium text-primary">{progress}%</span>
            </div>
          </div>

          <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                progress === 100 ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {expanded && (
          <div className="border-t px-4 pb-4 pt-3 space-y-2">
            {phase.tasks.length > 0 && phase.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}

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
          </div>
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
// Project summary stats
// ---------------------------------------------------------------------------

function ProjectSummaryBar({ project }: { project: ProjectResponse }) {
  const totalTasks = project.phases.flatMap((p) => p.tasks).length;
  const doneTasks = project.phases.flatMap((p) => p.tasks).filter((t) => t.status === "done").length;
  const overallProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter((p) => p.status === "completed" || p.status === "done").length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Euro className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Budget</span>
        </div>
        <p className="text-lg font-bold">
          {project.budget_cents != null ? formatBudget(project.budget_cents) : "--"}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Layers className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Fases</span>
        </div>
        <p className="text-lg font-bold">
          {donePhases}<span className="text-muted-foreground font-normal">/{totalPhases}</span>
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <ClipboardList className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Taken</span>
        </div>
        <p className="text-lg font-bold">
          {doneTasks}<span className="text-muted-foreground font-normal">/{totalTasks}</span>
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <BarChart3 className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Voortgang</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold">{overallProgress}%</p>
          <div className="flex-1 h-2 rounded-full bg-muted">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                overallProgress === 100 ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action bar — prominent CTAs for admin tasks
// ---------------------------------------------------------------------------

function ActionBar({ projectId }: { projectId: string }) {
  const actions = [
    {
      label: "Factuur maken",
      href: "/dashboard/invoices/new",
      icon: Receipt,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20",
    },
    {
      label: "Offerte",
      href: "/dashboard/quotes/new",
      icon: ClipboardList,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20",
    },
    {
      label: "Rapport",
      href: "/dashboard/reports",
      icon: FileText,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20",
    },
    {
      label: "Planning",
      href: `/dashboard/projects/${projectId}/gantt`,
      icon: CalendarDays,
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20",
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link key={a.label} href={a.href}>
          <button
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              a.color
            )}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contract financial summary
// ---------------------------------------------------------------------------

interface ContractFinancials {
  invoiced_cents: number;
  paid_cents: number;
  outstanding_cents: number;
}

function ContractSummaryCard({ project, financials }: { project: ProjectResponse; financials: ContractFinancials }) {
  const budget = project.budget_cents ?? 0;
  const invoicedPct = budget > 0 ? Math.min(100, Math.round((financials.invoiced_cents / budget) * 100)) : 0;
  const paidPct = budget > 0 ? Math.min(100, Math.round((financials.paid_cents / budget) * 100)) : 0;
  const remaining = budget - financials.invoiced_cents;

  return (
    <Card className="overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Euro className="h-4 w-4 text-primary" />
            Contractoverzicht
          </h3>
          {budget > 0 && (
            <span className="text-xs text-muted-foreground">
              {invoicedPct}% gefactureerd
            </span>
          )}
        </div>

        {/* Progress bars */}
        {budget > 0 && (
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${paidPct}%` }}
                title={`Betaald: ${formatBudget(financials.paid_cents)}`}
              />
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(0, invoicedPct - paidPct)}%` }}
                title={`Openstaand: ${formatBudget(financials.outstanding_cents)}`}
              />
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Betaald
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Openstaand
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted" />
                Resterend
              </span>
            </div>
          </div>
        )}

        {/* Amounts grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Contractwaarde</p>
            <p className="text-base font-bold mt-0.5">{budget > 0 ? formatBudget(budget) : "--"}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Gefactureerd</p>
            <p className="text-base font-bold mt-0.5 text-blue-600 dark:text-blue-400">
              {formatBudget(financials.invoiced_cents)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Betaald</p>
            <p className="text-base font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
              {formatBudget(financials.paid_cents)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Resterend</p>
            <p className={cn("text-base font-bold mt-0.5", remaining < 0 ? "text-red-500" : "text-muted-foreground")}>
              {formatBudget(Math.max(0, remaining))}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

interface TabItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

function ProjectTabs({ projectId, activeTab }: { projectId: string; activeTab: string }) {
  const tabs: TabItem[] = [
    { label: "Overzicht", href: `/dashboard/projects/${projectId}`, icon: ClipboardList },
    { label: "Takenbord", href: `/dashboard/projects/${projectId}/board`, icon: KanbanSquare },
    { label: "Gantt", href: `/dashboard/projects/${projectId}/gantt`, icon: GitBranch },
    { label: "Processen", href: `/dashboard/projects/${projectId}/processes`, icon: Layers },
    { label: "Tijdlijn", href: `/dashboard/projects/${projectId}/timeline`, icon: Timer },
  ];

  return (
    <div className="flex gap-1 overflow-x-auto border-b pb-px">
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = activeTab === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
  const pathname = usePathname();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financials, setFinancials] = useState<ContractFinancials>({
    invoiced_cents: 0,
    paid_cents: 0,
    outstanding_cents: 0,
  });

  useEffect(() => {
    params.then(({ id }) => {
      getProject(id)
        .then((proj) => {
          setProject(proj);
          apiFetch<{ data: Array<{ status: string; total_cents: number }> }>(
            `/invoices?project_id=${id}&per_page=200`
          )
            .then((res) => {
              const invoices = res.data ?? [];
              setFinancials({
                invoiced_cents: invoices.reduce((s, i) => s + i.total_cents, 0),
                paid_cents: invoices
                  .filter((i) => i.status === "paid")
                  .reduce((s, i) => s + i.total_cents, 0),
                outstanding_cents: invoices
                  .filter((i) => i.status === "sent" || i.status === "overdue")
                  .reduce((s, i) => s + i.total_cents, 0),
              });
            })
            .catch(() => {});
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error ?? "Project niet gevonden."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/dashboard/projects">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Projecten
        </Button>
      </Link>

      {/* Project header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              STATUS_BADGE_CLASS[project.status] ?? "bg-muted text-muted-foreground"
            )}
          >
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
        </div>

        {project.description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{project.description}</p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {(project.start_date || project.end_date) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(project.start_date)} – {formatDate(project.end_date)}
            </span>
          )}
        </div>
      </div>

      {/* Action bar — core admin actions */}
      <ActionBar projectId={project.id} />

      {/* Contract / Budget summary bar */}
      <ProjectSummaryBar project={project} />

      {/* Contract financial summary */}
      <ContractSummaryCard project={project} financials={financials} />

      {/* Tab navigation */}
      <ProjectTabs projectId={project.id} activeTab={pathname} />

      {/* Punch list */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Nakijklijst</h2>
        <PunchListTab projectId={project.id} />
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Fases</h2>
        {project.phases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen fases toegevoegd.</p>
        ) : (
          <div className="space-y-2">
            {project.phases.map((phase) => <PhaseCard key={phase.id} phase={phase} />)}
          </div>
        )}
      </div>

      {/* Time tracking */}
      <TimeTracker projectId={project.id} />
    </div>
  );
}
