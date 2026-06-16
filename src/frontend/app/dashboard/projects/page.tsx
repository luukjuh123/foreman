"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Calendar, Clock, AlertTriangle, Search, User, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listProjects,
  calcTaskSummary,
  formatBudget,
  formatDate,
} from "@/lib/projects";
import { TrendingUp, Wallet, BarChart3 } from "lucide-react";
import type { ProjectResponse } from "@/lib/types";

type ViewMode = "grid" | "list";

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
// Circular progress ring
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
// Project card
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
                {formatDate(project.start_date)} - {formatDate(project.end_date)}
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
// Portfolio summary
// ---------------------------------------------------------------------------

function PortfolioSummary({ projects }: { projects: ProjectResponse[] }) {
  const active = projects.filter((p) => p.status === "active");
  const totalBudget = projects.reduce((s, p) => s + (p.budget_cents ?? 0), 0);
  const activeBudget = active.reduce((s, p) => s + (p.budget_cents ?? 0), 0);
  const allTasks = projects.flatMap((p) => p.phases ?? []).flatMap((ph) => ph.tasks ?? []);
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const completionRate = allTasks.length > 0 ? Math.round((doneTasks / allTasks.length) * 100) : 0;

  const cards = [
    {
      label: "Totaal portfolio",
      value: formatBudget(totalBudget),
      sublabel: `${projects.length} projecten`,
      icon: Wallet,
      accent: "bg-primary",
      iconBg: "bg-primary/10",
      iconText: "text-primary",
    },
    {
      label: "Actief budget",
      value: formatBudget(activeBudget),
      sublabel: `${active.length} lopend`,
      icon: TrendingUp,
      accent: "bg-emerald-500",
      iconBg: "bg-emerald-500/10",
      iconText: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Voortgang",
      value: `${completionRate}%`,
      sublabel: `${doneTasks}/${allTasks.length} taken`,
      icon: BarChart3,
      accent: "bg-blue-500",
      iconBg: "bg-blue-500/10",
      iconText: "text-blue-600 dark:text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="relative overflow-hidden">
          <div className={`absolute left-0 top-0 h-full w-1 ${c.accent}`} />
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
              <c.icon className={`h-5 w-5 ${c.iconText}`} />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</p>
              <p className="text-xl font-bold tracking-tight mt-0.5">{c.value}</p>
              <p className="text-[11px] text-muted-foreground">{c.sublabel}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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
  const [view, setView] = useState<ViewMode>("grid");

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

      {/* Portfolio summary */}
      {!loading && projects.length > 0 && <PortfolioSummary projects={projects} />}

      {/* Search + filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border/50 p-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {label}
                <span className={cn(
                  "ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                  filter === key
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek projecten..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-56 animate-pulse rounded bg-muted" />
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
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
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Periode</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Voortgang</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((project) => {
                    const summary = calcTaskSummary(project);
                    const progressPercent = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
                    const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
                    return (
                      <tr
                        key={project.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => window.location.href = `/dashboard/projects/${project.id}`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[240px]">{project.name}</p>
                            {project.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[240px]">{project.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                              statusCfg.bg, statusCfg.text
                            )}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
                              {STATUS_LABELS[project.status] ?? project.status}
                            </span>
                            <DeadlineBadge endDate={project.end_date} />
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">
                          <span className="text-xs">
                            {formatDate(project.start_date)} - {formatDate(project.end_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-2.5 min-w-[120px]">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  progressPercent === 100 ? "bg-emerald-500" : "bg-primary"
                                )}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground w-8 text-right">{progressPercent}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold">
                          {project.budget_cents != null ? formatBudget(project.budget_cents) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
