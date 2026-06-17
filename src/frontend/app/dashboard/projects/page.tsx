"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Calendar, FolderPlus, Search, ArrowUpDown } from "lucide-react";
import { listProjects, calcTaskSummary } from "@/lib/projects";
import { formatMoney, formatDate } from "@/lib/format";
import type { ProjectResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type FilterTab = "all" | "active" | "draft" | "completed" | "archived";
type SortKey = "recent" | "name" | "budget";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Actief" },
  { key: "draft", label: "Concept" },
  { key: "completed", label: "Voltooid" },
  { key: "archived", label: "Gearchiveerd" },
];

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter((p) => p.status === "completed" || p.status === "done").length;
  const phasePercent = totalPhases > 0 ? Math.round((donePhases / totalPhases) * 100) : 0;

  return (
    <Link href={`/dashboard/projects/${project.id}`} aria-label={project.name}>
      <Card className="h-full cursor-pointer border-border/60 bg-card/80 transition-all duration-150 hover:border-primary/30 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-semibold leading-tight text-foreground">
              {project.name}
            </CardTitle>
            <StatusBadge status={project.status} className="shrink-0" />
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2 text-xs leading-relaxed">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Date range */}
          {(project.start_date || project.end_date) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>
                {formatDate(project.start_date)} – {formatDate(project.end_date)}
              </span>
            </div>
          )}

          {/* Budget */}
          {project.budget_cents != null && (
            <p className="text-xs font-medium text-muted-foreground">
              Budget:{" "}
              <span className="text-foreground">{formatMoney(project.budget_cents)}</span>
            </p>
          )}

          {/* Phase progress */}
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Fases</span>
              <span className="tabular-nums">
                {donePhases}/{totalPhases}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-1.5 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${phasePercent}%` }}
              />
            </div>
          </div>

          {/* Task summary */}
          <p className="text-xs text-muted-foreground tabular-nums">
            {summary.done}/{summary.total} taken voltooid
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function ProjectCardSkeleton() {
  return (
    <Card className="h-48 border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-1.5 h-3 w-full" />
        <Skeleton className="mt-1 h-3 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
        <FolderPlus className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        {isFiltered ? "Geen projecten gevonden" : "Nog geen projecten"}
      </h3>
      <p className="mb-5 max-w-xs text-xs text-muted-foreground">
        {isFiltered
          ? "Pas uw zoekopdracht of filter aan."
          : "Maak uw eerste project aan om te beginnen."}
      </p>
      {!isFiltered && (
        <Link href="/dashboard/projects/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuw project
          </Button>
        </Link>
      )}
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
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    listProjects(1, 100)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const displayed = useMemo(() => {
    let list = filter === "all" ? projects : projects.filter((p) => p.status === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    if (sort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, "nl"));
    } else if (sort === "budget") {
      list = [...list].sort((a, b) => (b.budget_cents ?? 0) - (a.budget_cents ?? 0));
    }
    // "recent" — natural API order (created_at desc from backend)

    return list;
  }, [projects, filter, search, sort]);

  const isFiltered = filter !== "all" || search.trim() !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Projecten</h1>
          <p className="text-xs text-muted-foreground">
            {loading ? "Laden…" : `${projects.length} project${projects.length !== 1 ? "en" : ""}`}
          </p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuw project
          </Button>
        </Link>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Zoeken op naam…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-input bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="recent">Recent</option>
            <option value="name">Naam A–Z</option>
            <option value="budget">Budget (hoog–laag)</option>
          </select>
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList>
          {FILTER_TABS.map(({ key, label }) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState isFiltered={isFiltered} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
