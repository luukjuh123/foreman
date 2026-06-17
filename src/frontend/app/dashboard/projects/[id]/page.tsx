"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { DocumentList } from "@/components/documents/document-list";
import {
  ChevronRight,
  ChevronDown,
  UserPlus,
  X,
  Calendar,
  Banknote,
  Layers,
  CheckSquare,
  LayoutGrid,
  GanttChartSquare,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProject, calcPhaseProgress } from "@/lib/projects";
import { formatMoney, formatDate } from "@/lib/format";
import type { ProjectResponse, PhaseResponse, TaskResponse } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import type { SubcontractorResponse, SubcontractorListResponse } from "@/lib/subcontractors";
import TimeTracker from "@/components/time-tracking/TimeTracker";
import PunchListTab from "@/components/punch-list/PunchListTab";

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task }: { task: TaskResponse }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 border border-border/30">
      <span className="text-sm text-foreground">{task.name}</span>
      <StatusBadge status={task.status} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Onderaannemer toewijzen</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="" disabled>Selecteer onderaannemer</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.company_name}</option>
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Annuleren</Button>
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
      <Card className="border-border/60 bg-card/80">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <CardTitle className="text-sm font-semibold">{phase.name}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={phase.status} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {done}/{total} taken
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-1.5 pt-0">
            {phase.tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen taken.</p>
            ) : (
              phase.tasks.map((task) => <TaskRow key={task.id} task={task} />)
            )}

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
// Key facts card grid
// ---------------------------------------------------------------------------

interface KeyFactsProps {
  project: ProjectResponse;
}

function KeyFacts({ project }: KeyFactsProps) {
  const allTasks = project.phases.flatMap((p) => p.tasks);
  const openTasks = allTasks.filter((t) => t.status !== "done").length;
  const donePhases = project.phases.filter(
    (p) => p.status === "completed" || p.status === "done"
  ).length;

  const facts = [
    {
      icon: Calendar,
      label: "Looptijd",
      value: project.start_date
        ? `${formatDate(project.start_date)} – ${formatDate(project.end_date)}`
        : "Niet ingesteld",
    },
    {
      icon: Banknote,
      label: "Budget",
      value: project.budget_cents != null
        ? formatMoney(project.budget_cents)
        : "Niet ingesteld",
    },
    {
      icon: Layers,
      label: "Fases",
      value: `${donePhases}/${project.phases.length} voltooid`,
    },
    {
      icon: CheckSquare,
      label: "Open taken",
      value: `${openTasks} open`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {facts.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="rounded-lg border border-border/50 bg-muted/30 px-4 py-3"
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <p className="text-sm font-semibold text-foreground">{value}</p>
        </div>
      ))}
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
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overzicht");

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
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm">
            <ChevronRight className="mr-1 h-4 w-4 rotate-180" />
            Projecten
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error ?? "Project niet gevonden."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/projects" className="hover:text-foreground transition-colors">
          Projecten
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {project.name}
        </span>
      </nav>

      {/* Project header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
          <StatusBadge status={project.status} className="text-sm px-2.5 py-0.5" />
        </div>

        {project.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
        )}

        {/* View buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/projects/${project.id}/board`}>
            <Button variant="outline" size="sm">
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Takenbord
            </Button>
          </Link>
          <Link href={`/dashboard/projects/${project.id}/gantt`}>
            <Button variant="outline" size="sm">
              <GanttChartSquare className="mr-1.5 h-4 w-4" />
              Gantt
            </Button>
          </Link>
          <Link href={`/dashboard/projects/${project.id}/processes`}>
            <Button variant="outline" size="sm">
              <Clock className="mr-1.5 h-4 w-4" />
              Processen
            </Button>
          </Link>
          <Link href={`/dashboard/projects/${project.id}/timeline`}>
            <Button variant="outline" size="sm">Tijdlijn</Button>
          </Link>
        </div>
      </div>

      {/* Key facts */}
      <KeyFacts project={project} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="fases">Fases</TabsTrigger>
          <TabsTrigger value="documenten">Documenten</TabsTrigger>
          <TabsTrigger value="nakijklijst">Nakijklijst</TabsTrigger>
          <TabsTrigger value="uren">Tijdregistratie</TabsTrigger>
        </TabsList>

        <TabsContent value="overzicht">
          {/* Phase summary + quick info */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Faseoverzicht
            </h2>
            {project.phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen fases toegevoegd.</p>
            ) : (
              project.phases.map((phase) => <PhaseCard key={phase.id} phase={phase} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="fases">
          <div className="space-y-3">
            {project.phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen fases toegevoegd.</p>
            ) : (
              project.phases.map((phase) => <PhaseCard key={phase.id} phase={phase} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="documenten">
          <DocumentList projectId={project.id} />
        </TabsContent>

        <TabsContent value="nakijklijst">
          <PunchListTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="uren">
          <TimeTracker projectId={project.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
