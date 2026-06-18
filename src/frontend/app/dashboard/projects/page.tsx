"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, TrendingUp, AlertCircle, FolderKanban, Search, Users, LayoutGrid, List, ArrowUpDown, ChevronDown } from "lucide-react";
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

const STATUS_CONFIG: Record<string, { dot: string; bg: string; text: string }> = {
  draft: { dot: "bg-gray-400", bg: "bg-gray-500/10 dark:bg-gray-500/15", text: "text-gray-600 dark:text-gray-400" },
  active: { dot: "bg-blue-500", bg: "bg-blue-500/10 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
  completed: { dot: "bg-emerald-500", bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
  archived: { dot: "bg-amber-500", bg: "bg-amber-500/10 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
};

type FilterTab = "all" | "active" | "draft" | "completed" | "archived";
type SortKey = "name" | "deadline" | "budget" | "progress" | "updated";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Actief" },
  { key: "draft", label: "Concept" },
  { key: "completed", label: "Voltooid" },
  { key: "archived", label: "Gearchiveerd" },
];

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

function ProjectSummaryStrip({ projects }: { projects: ProjectResponse[] }) {
  const active = projects.filter((p) => p.status === "active").length;
  const totalBudget = projects.reduce((s, p) => s + (p.budget_cents ?? 0), 0);
  const overdueTasks = projects
    .flatMap((p) => (p.phases ?? []).flatMap((ph) => ph.tasks ?? []))
    .filter((t) => t.status !== "done" && t.end_date && new Date(t.end_date) < new Date()).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
          <FolderKanban className="h-4 w-4 text-blue-500" />
        </div>
        <div>
          <p className="text-lg font-extrabold leading-none">{active}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Actieve projecten</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </div>
        <div>
          <p className="text-lg font-extrabold leading-none">{formatBudget(totalBudget)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Totaal budget</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", overdueTasks > 0 ? "bg-red-500/10" : "bg-emerald-500/10")}>
          <AlertCircle className={cn("h-4 w-4", overdueTasks > 0 ? "text-red-500" : "text-emerald-500")} />
        </div>
        <div>
          <p className="text-lg font-extrabold leading-none">{overdueTasks}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Verlopen taken</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

function getProjectHealth(project: ProjectResponse): { label: string; color: string; dotColor: string } {
  const now = new Date();
  const overdueTasks = (project.phases ?? [])
    .flatMap((ph) => ph.tasks ?? [])
    .filter((t) => t.status !== "done" && t.end_date && new Date(t.end_date) < now).length;
  const isOverdue = project.end_date ? new Date(project.end_date) < now : false;

  if (project.status === "completed") return { label: "Voltooid", color: "text-emerald-500", dotColor: "bg-emerald-500" };
  if (isOverdue || overdueTasks > 3) return { label: "Achter schema", color: "text-red-500", dotColor: "bg-red-500" };
  if (overdueTasks > 0) return { label: "Aandacht nodig", color: "text-amber-500", dotColor: "bg-amber-500" };
  return { label: "Op schema", color: "text-emerald-500", dotColor: "bg-emerald-500" };
}

function ProgressRing({ percent, size = 48 }: { percent: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(100, percent);
  const offset = circumference - (fill / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
        <circle
          cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("metric-ring", fill >= 100 ? "text-emerald-500" : "text-primary")}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-[11px] font-extrabold", fill >= 100 ? "text-emerald-500" : "text-foreground")}>
          {fill}%
        </span>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function getDeadlineInfo(endDate: string | null | undefined): { label: string; color: string; urgent: boolean } | null {
  if (!endDate) return null;
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: `${Math.abs(days)}d te laat`, color: "text-red-500 bg-red-500/10", urgent: true };
  if (days <= 3) return { label: `${days}d resterend`, color: "text-amber-500 bg-amber-500/10", urgent: true };
  if (days <= 7) return { label: `${days}d resterend`, color: "text-blue-500 bg-blue-500/10", urgent: false };
  return null;
}

function ProjectCard({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter((p) => p.status === "completed" || p.status === "done").length;
  const taskPercent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const health = getProjectHealth(project);
  const deadline = project.status === "active" ? getDeadlineInfo(project.end_date) : null;

  return (
    <Link href={`/dashboard/projects/${project.id}`} aria-label={project.name}>
      <Card className="h-full cursor-pointer hover:shadow-xl transition-all duration-300 group overflow-hidden relative card-gradient-border">
        {/* Top color accent */}
        <div className={cn("h-[3px]", statusCfg.dot)} />

        <CardContent className="p-0">
          {/* Top section — project identity */}
          <div className="p-5 pb-4">
            {/* Status + health row */}
            <div className="flex items-center justify-between mb-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
                  statusCfg.bg,
                  statusCfg.text
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
              <div className="flex items-center gap-1.5">
                {deadline ? (
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold", deadline.color, deadline.urgent && "animate-pulse")}>
                    {deadline.label}
                  </span>
                ) : (
                  <>
                    <span className={cn("h-2 w-2 rounded-full", health.dotColor)} />
                    <span className={cn("text-[10px] font-medium", health.color)}>{health.label}</span>
                  </>
                )}
              </div>
            </div>

            {/* Project name + customer */}
            <div className="flex items-start gap-3.5">
              {project.customer_name ? (
                <div className="avatar-initials h-11 w-11 shrink-0 text-[11px] rounded-xl shadow-sm">
                  {getInitials(project.customer_name)}
                </div>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/30">
                  <FolderKanban className="h-4.5 w-4.5 text-muted-foreground/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {project.name}
                </h3>
                {project.customer_name && (
                  <p className="text-[11px] text-muted-foreground/60 truncate mt-1">
                    {project.customer_name}
                  </p>
                )}
              </div>
              {/* Mini progress ring */}
              <ProgressRing percent={taskPercent} size={44} />
            </div>
          </div>

          {/* Metrics strip — darker bg section */}
          <div className="bg-muted/20 border-t border-border/30 px-5 py-3.5">
            <div className="grid grid-cols-3 gap-3">
              {/* Budget */}
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Budget</p>
                <p className="text-sm font-extrabold tracking-tight leading-tight mt-0.5">
                  {project.budget_cents != null && project.budget_cents > 0
                    ? formatBudget(project.budget_cents)
                    : <span className="text-muted-foreground/30">—</span>
                  }
                </p>
              </div>
              {/* Tasks */}
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Taken</p>
                <p className="text-sm font-extrabold tracking-tight leading-tight mt-0.5">
                  {summary.done}<span className="text-muted-foreground font-medium">/{summary.total}</span>
                </p>
              </div>
              {/* Deadline */}
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Deadline</p>
                <p className={cn("text-sm font-extrabold tracking-tight leading-tight mt-0.5", deadline && deadline.urgent ? deadline.color.split(" ")[0] : "")}>
                  {project.end_date ? formatDate(project.end_date) : <span className="text-muted-foreground/30">—</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Phase progress — bottom bar */}
          <div className="px-5 py-3 border-t border-border/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">Fases</span>
              <span className="text-[11px] font-bold text-foreground/70">{donePhases}/{totalPhases}</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.max(totalPhases, 1) }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all duration-500",
                    i < donePhases
                      ? "bg-gradient-to-r from-primary to-amber-500 shadow-sm shadow-primary/20"
                      : "bg-muted/30"
                  )}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<SortKey>("updated");
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    listProjects(1, 50)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) =>
      !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name, "nl");
        case "deadline": {
          const da = a.end_date ? new Date(a.end_date).getTime() : Infinity;
          const db = b.end_date ? new Date(b.end_date).getTime() : Infinity;
          return da - db;
        }
        case "budget":
          return (b.budget_cents ?? 0) - (a.budget_cents ?? 0);
        case "progress": {
          const pa = calcTaskSummary(a);
          const pb = calcTaskSummary(b);
          const pctA = pa.total > 0 ? pa.done / pa.total : 0;
          const pctB = pb.total > 0 ? pb.done / pb.total : 0;
          return pctB - pctA;
        }
        case "updated":
        default: {
          const ua = (a as { updated_at?: string }).updated_at ?? "";
          const ub = (b as { updated_at?: string }).updated_at ?? "";
          return ub.localeCompare(ua);
        }
      }
    });

  const counts: Record<string, number> = {
    all: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    draft: projects.filter((p) => p.status === "draft").length,
    completed: projects.filter((p) => p.status === "completed").length,
    archived: projects.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <div className="hero-card rounded-2xl p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[28px] md:text-[32px] font-black tracking-tight text-gradient leading-none">Projecten</h1>
            <p className="text-[13px] text-muted-foreground/60">
              Beheer al uw bouwprojecten en hun voortgang
            </p>
          </div>
          <Link href="/dashboard/projects/new">
            <Button size="sm" className="gap-1.5 shadow-lg shadow-primary/25 font-semibold bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90">
              <Plus className="h-3.5 w-3.5" />
              Nieuw project
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && projects.length > 0 && <ProjectSummaryStrip projects={projects} />}

      {/* Filter bar + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                filter === key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {{ name: "Naam", deadline: "Deadline", budget: "Budget", progress: "Voortgang", updated: "Recent" }[sort]}
              <ChevronDown className={cn("h-3 w-3 transition-transform", sortOpen && "rotate-180")} />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border/60 bg-card shadow-xl py-1 animate-scale-in">
                  {([
                    { key: "updated" as SortKey, label: "Recent bijgewerkt" },
                    { key: "name" as SortKey, label: "Naam (A-Z)" },
                    { key: "deadline" as SortKey, label: "Deadline (vroegst)" },
                    { key: "budget" as SortKey, label: "Budget (hoogst)" },
                    { key: "progress" as SortKey, label: "Voortgang (%)" },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setSort(opt.key); setSortOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors",
                        sort === opt.key ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg border border-border/50 p-0.5">
            <button
              onClick={() => setView("cards")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kaarten
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Tabel
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Zoeken..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                <div className="h-2 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Geen projecten gevonden</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {search ? "Pas uw zoekopdracht aan" : "Maak een nieuw project aan om te beginnen"}
          </p>
          {!search && (
            <Link href="/dashboard/projects/new">
              <Button size="sm" variant="outline" className="mt-4 gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Eerste project aanmaken
              </Button>
            </Link>
          )}
        </div>
      ) : view === "table" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="premium-table w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Project</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Klant</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Fases</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Taken</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Budget</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Deadline</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">Voortgang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.map((project) => {
                    const summary = calcTaskSummary(project);
                    const totalPhases = project.phases.length;
                    const donePhases = project.phases.filter((p) => p.status === "completed" || p.status === "done").length;
                    const taskPercent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
                    const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
                    const isOverdue = project.end_date ? new Date(project.end_date) < new Date() : false;

                    return (
                      <tr
                        key={project.id}
                        className={cn(
                          "status-row hover:bg-muted/30 transition-colors",
                          project.status === "active" && "border-l-[3px] border-l-blue-500/50",
                          project.status === "completed" && "border-l-[3px] border-l-emerald-500/50",
                          project.status === "draft" && "border-l-[3px] border-l-gray-400/50",
                          project.status === "archived" && "border-l-[3px] border-l-amber-500/50",
                        )}
                      >
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/dashboard/projects/${project.id}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {project.customer_name ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold",
                            statusCfg.bg,
                            statusCfg.text,
                          )}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
                            {STATUS_LABELS[project.status] ?? project.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">
                          {donePhases}/{totalPhases} voltooid
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500 transition-all"
                                style={{ width: `${taskPercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {summary.done}/{summary.total}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-sm">
                          {project.budget_cents != null && project.budget_cents > 0
                            ? formatBudget(project.budget_cents)
                            : <span className="text-muted-foreground/40">—</span>
                          }
                        </td>
                        <td className={cn("px-4 py-3.5 text-sm", isOverdue ? "text-red-500 font-semibold" : "text-muted-foreground")}>
                          {project.end_date ? formatDate(project.end_date) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  taskPercent >= 100 ? "bg-emerald-500" : "bg-primary"
                                )}
                                style={{ width: `${taskPercent}%` }}
                              />
                            </div>
                            <span className={cn(
                              "text-xs font-bold",
                              taskPercent >= 100 ? "text-emerald-500" : "text-primary"
                            )}>
                              {taskPercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
