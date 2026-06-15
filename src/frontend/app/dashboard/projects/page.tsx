"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Calendar,
  Clock,
  AlertTriangle,
  Search,
  User,
  LayoutGrid,
  List,
  Euro,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listProjects,
  calcTaskSummary,
  formatBudget,
  formatDate,
} from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  active: "Actief",
  completed: "Voltooid",
  archived: "Gearchiveerd",
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  draft: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" },
  active: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  completed: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  archived: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
};

type FilterTab = "all" | "active" | "draft" | "completed" | "archived";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Actief" },
  { key: "draft", label: "Concept" },
  { key: "completed", label: "Voltooid" },
  { key: "archived", label: "Gearchiveerd" },
];

// ---------------------------------------------------------------------------
// Deadline urgency
// ---------------------------------------------------------------------------

function getDeadlineUrgency(endDate: string | null): "overdue" | "soon" | "ok" | null {
  if (!endDate) return null;
  const now = new Date();
  const end = new Date(endDate);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 7) return "soon";
  return "ok";
}

function DeadlineBadge({ endDate }: { endDate: string | null }) {
  const urgency = getDeadlineUrgency(endDate);
  if (!urgency || urgency === "ok") return null;

  if (urgency === "overdue") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-950/40 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
        <AlertTriangle className="h-2.5 w-2.5" />
        Verlopen
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-2.5 w-2.5" />
      Bijna deadline
    </span>
  );
}

// ---------------------------------------------------------------------------
// Circular progress
// ---------------------------------------------------------------------------

function CircularProgress({ percent, size = 44 }: { percent: number; size?: number }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent === 100 ? "stroke-emerald-500" : percent > 50 ? "stroke-primary" : "stroke-primary/70";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-500", color)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
        {percent}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card (grid view)
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter((p) => p.status === "completed" || p.status === "done").length;
  const progressPercent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const customerName = (project as { customer_name?: string }).customer_name;

  return (
    <Link href={`/dashboard/projects/${project.id}`} aria-label={project.name}>
      <Card className="h-full cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-200 group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base leading-tight group-hover:text-primary transition-colors">
                {project.name}
              </CardTitle>
              {project.description && (
                <CardDescription className="line-clamp-1 text-xs mt-1">
                  {project.description}
                </CardDescription>
              )}
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-medium",
                statusCfg.bg, statusCfg.text
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Customer + dates row */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            {customerName && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {customerName}
              </span>
            )}
            {(project.start_date || project.end_date) && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(project.start_date)} – {formatDate(project.end_date)}
              </span>
            )}
            <DeadlineBadge endDate={project.end_date} />
          </div>

          {/* Progress + budget row */}
          <div className="flex items-center gap-4">
            <CircularProgress percent={progressPercent} />
            <div className="flex-1 min-w-0 space-y-1.5">
              {project.budget_cents != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Budget</span>
                  <span className="text-sm font-semibold">{formatBudget(project.budget_cents)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{summary.done}/{summary.total} taken</span>
                <span className="text-muted-foreground">{donePhases}/{totalPhases} fases</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Project row (table view)
// ---------------------------------------------------------------------------

function ProjectRow({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const progressPercent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const customerName = (project as { customer_name?: string }).customer_name;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-accent/50 transition-colors group"
    >
      {/* Status dot + name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusCfg.dot)} />
        <div className="min-w-0">
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate block">
            {project.name}
          </span>
          {customerName && (
            <span className="text-xs text-muted-foreground">{customerName}</span>
          )}
        </div>
      </div>

      {/* Status badge */}
      <span className={cn(
        "hidden sm:inline-flex items-center gap-1.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
        statusCfg.bg, statusCfg.text
      )}>
        {STATUS_LABELS[project.status] ?? project.status}
      </span>

      {/* Progress bar */}
      <div className="hidden md:flex items-center gap-2 w-32 shrink-0">
        <div className="flex-1 h-1.5 rounded-full bg-muted">
          <div
            className={cn("h-1.5 rounded-full transition-all", progressPercent === 100 ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground w-8 text-right">{progressPercent}%</span>
      </div>

      {/* Budget */}
      <span className="hidden lg:block text-sm font-medium w-28 text-right shrink-0">
        {project.budget_cents != null ? formatBudget(project.budget_cents) : "—"}
      </span>

      {/* Dates */}
      <span className="hidden xl:block text-xs text-muted-foreground w-40 text-right shrink-0">
        {project.start_date || project.end_date
          ? `${formatDate(project.start_date)} – ${formatDate(project.end_date)}`
          : "—"}
      </span>

      <DeadlineBadge endDate={project.end_date} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ViewMode = "grid" | "list";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    listProjects(1, 50)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    draft: projects.filter((p) => p.status === "draft").length,
    completed: projects.filter((p) => p.status === "completed").length,
    archived: projects.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projecten</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.active} actief, {counts.all} totaal
          </p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nieuw Project
          </Button>
        </Link>
      </div>

      {/* Search + filter + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map(({ key, label }) => (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(key)}
              className="gap-1.5"
            >
              {label}
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                filter === key
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {counts[key]}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek projecten..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg border p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Rasterweergave"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Lijstweergave"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted mt-2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <Search className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Geen projecten gevonden</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Pas je zoekopdracht aan" : "Maak je eerste project aan om te beginnen"}
          </p>
          {!search && (
            <Link href="/dashboard/projects/new">
              <Button size="sm" className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" />
                Nieuw Project
              </Button>
            </Link>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Table header */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">Project</span>
              <span className="hidden sm:block w-24">Status</span>
              <span className="hidden md:block w-32">Voortgang</span>
              <span className="hidden lg:block w-28 text-right">Budget</span>
              <span className="hidden xl:block w-40 text-right">Periode</span>
            </div>
            <div className="divide-y divide-border/50">
              {filtered.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
