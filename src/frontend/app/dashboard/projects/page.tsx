"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Calendar,
  Search,
  LayoutGrid,
  List,
  FolderOpen,
  TrendingUp,
  Euro,
  CheckCircle2,
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
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  active: "Actief",
  completed: "Voltooid",
  archived: "Gearchiveerd",
};

const STATUS_BADGE_VARIANT: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  draft: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
  },
  active: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  completed: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  archived: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
};

type StatusFilter = "all" | "active" | "draft" | "completed" | "archived";
type SortKey = "recent" | "naam" | "voortgang";
type ViewMode = "grid" | "table";

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Actief" },
  { key: "draft", label: "Concept" },
  { key: "completed", label: "Voltooid" },
  { key: "archived", label: "Gearchiveerd" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Meest recent" },
  { key: "naam", label: "Naam" },
  { key: "voortgang", label: "Voortgang" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcProgress(project: ProjectResponse): number {
  const allTasks = project.phases.flatMap((p) => p.tasks ?? []);
  if (allTasks.length === 0) return 0;
  return Math.round(
    (allTasks.filter((t) => t.status === "done").length / allTasks.length) * 100
  );
}

function calcPhaseProgress(project: ProjectResponse): number {
  const total = project.phases.length;
  if (total === 0) return 0;
  const done = project.phases.filter(
    (p) => p.status === "completed" || p.status === "done"
  ).length;
  return Math.round((done / total) * 100);
}

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_BADGE_VARIANT[status] ?? STATUS_BADGE_VARIANT.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant.bg,
        variant.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", variant.dot)} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted", className)}>
      <div
        className="h-1.5 rounded-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        role="progressbar"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-5 space-y-3">
      <div className="flex justify-between">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
      <div className="h-3 w-1/2 rounded bg-muted" />
      <div className="h-3 w-1/3 rounded bg-muted" />
      <div className="h-1.5 w-full rounded-full bg-muted" />
      <div className="h-3 w-1/4 rounded bg-muted" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded bg-muted" style={{ width: `${60 + i * 5}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5 pb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Project card (grid view)
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const progress = calcProgress(project);
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter(
    (p) => p.status === "completed" || p.status === "done"
  ).length;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      aria-label={project.name}
      className="block group"
    >
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug line-clamp-2">
              {project.name}
            </CardTitle>
            <StatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground mt-1">
              {project.description}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Dates */}
          {(project.start_date || project.end_date) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {formatDate(project.start_date)} – {formatDate(project.end_date)}
              </span>
            </div>
          )}

          {/* Budget */}
          {project.budget_cents != null && project.budget_cents > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Euro className="h-3.5 w-3.5 shrink-0" />
              <span>{formatBudget(project.budget_cents)}</span>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Voortgang</span>
              <span>{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>

          {/* Phases + tasks footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>
              {donePhases}/{totalPhases} fases
            </span>
            <span>
              {summary.done}/{summary.total} taken voltooid
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Project table row (compact view)
// ---------------------------------------------------------------------------

function ProjectRow({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const progress = calcProgress(project);

  return (
    <tr className="border-b last:border-0 hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="font-medium text-sm hover:underline text-foreground"
        >
          {project.name}
        </Link>
        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {project.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={project.status} />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {project.start_date ? formatDate(project.start_date) : "—"}
        {" – "}
        {project.end_date ? formatDate(project.end_date) : "—"}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {project.budget_cents != null && project.budget_cents > 0
          ? formatBudget(project.budget_cents)
          : "—"}
      </td>
      <td className="px-4 py-3 min-w-[120px]">
        <div className="flex items-center gap-2">
          <ProgressBar value={progress} className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
            {progress}%
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {summary.done}/{summary.total} taken
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Search className="h-10 w-10 text-muted-foreground/40 mb-4" />
        <h3 className="text-base font-semibold mb-1">Geen resultaten</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Geen projecten gevonden met de huidige filters.
        </p>
        <Button variant="outline" size="sm" onClick={onClear}>
          Filters wissen
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-4" />
      <h3 className="text-base font-semibold mb-1">Nog geen projecten</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Maak een nieuw project aan om te beginnen.
      </p>
      <Link href="/dashboard/projects/new">
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Nieuw project
        </Button>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    listProjects(1, 100)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Derived stats
  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const active = projects.filter((p) => p.status === "active").length;
    const completedThisYear = projects.filter((p) => {
      if (p.status !== "completed") return false;
      const endYear = p.end_date ? parseInt(p.end_date.slice(0, 4)) : null;
      return endYear === thisYear;
    }).length;
    const totalBudget = projects.reduce(
      (acc, p) => acc + (p.budget_cents ?? 0),
      0
    );
    const progressValues = projects
      .filter((p) => p.status === "active")
      .map(calcProgress);
    const avgProgress =
      progressValues.length > 0
        ? Math.round(
            progressValues.reduce((a, b) => a + b, 0) / progressValues.length
          )
        : 0;
    return { active, completedThisYear, totalBudget, avgProgress };
  }, [projects]);

  // Filter + search + sort
  const filtered = useMemo(() => {
    let result = projects;

    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q)
      );
    }

    const sorted = [...result];
    if (sort === "naam") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    } else if (sort === "voortgang") {
      sorted.sort((a, b) => calcProgress(b) - calcProgress(a));
    } else {
      // recent: by created_at desc, fallback by id
      sorted.sort((a, b) => {
        const ta = a.created_at ?? "";
        const tb = b.created_at ?? "";
        return tb.localeCompare(ta);
      });
    }

    return sorted;
  }, [projects, statusFilter, search, sort]);

  const hasFilters = statusFilter !== "all" || search.trim() !== "";

  function clearFilters() {
    setStatusFilter("all");
    setSearch("");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projecten</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Beheer en volg al uw projecten
          </p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuw project
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border bg-card p-5 h-20"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Actieve projecten"
            value={stats.active}
            icon={<FolderOpen className="h-5 w-5" />}
          />
          <StatCard
            label="Afgerond dit jaar"
            value={stats.completedThisYear}
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
          <StatCard
            label="Totale begroting"
            value={stats.totalBudget > 0 ? formatBudget(stats.totalBudget) : "—"}
            icon={<Euro className="h-5 w-5" />}
          />
          <StatCard
            label="Gem. voortgang"
            value={`${stats.avgProgress}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            sub="actieve projecten"
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Zoeken op naam of omschrijving…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Sort */}
        <select
          aria-label="Sortering"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex items-center rounded-md border border-input overflow-hidden">
          <button
            aria-label="Rasterweergave"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            aria-label="Tabelweergave"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors border-l border-input",
              view === "table"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
        {STATUS_CHIPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors border",
              statusFilter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:bg-muted"
            )}
          >
            {label}
            {!loading && key !== "all" && (
              <span className="ml-1 tabular-nums">
                ({projects.filter((p) => p.status === key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Naam", "Status", "Periode", "Budget", "Voortgang", "Taken"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Naam", "Status", "Periode", "Budget", "Voortgang", "Taken"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
