"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Plus, Calendar, FolderOpen, Search } from "lucide-react";
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

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  archived: "bg-yellow-100 text-yellow-700",
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
// Skeleton loading cards
// ---------------------------------------------------------------------------

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-28" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const taskPct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter(
    (p) => p.status === "completed" || p.status === "done"
  ).length;

  return (
    <Link href={`/dashboard/projects/${project.id}`} aria-label={project.name}>
      <Card className="h-full cursor-pointer hover:shadow-md transition-all hover:border-primary/30">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">{project.name}</CardTitle>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                STATUS_BADGE_CLASS[project.status] ?? "bg-gray-100 text-gray-700"
              )}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2 text-xs mt-1">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
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
            <p className="text-xs font-medium text-foreground">
              <span className="text-muted-foreground">Budget: </span>
              {formatBudget(project.budget_cents)}
            </p>
          )}

          {/* Task progress bar */}
          {summary.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Voortgang taken</span>
                <span>{summary.done}/{summary.total} taken voltooid</span>
              </div>
              <Progress value={taskPct} className="h-1.5" />
            </div>
          )}

          {/* Phase summary */}
          {totalPhases > 0 && (
            <p className="text-xs text-muted-foreground">
              {donePhases}/{totalPhases} fases voltooid
            </p>
          )}
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

  useEffect(() => {
    listProjects(1, 50)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = filter === "all" ? projects : projects.filter((p) => p.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [projects, filter, search]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Projecten"
        description="Overzicht van alle bouwprojecten"
        actions={
          <Link href="/dashboard/projects/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuw Project
            </Button>
          </Link>
        }
      />

      {/* Search + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Zoek op naam…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map(({ key, label }) => (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Geen projecten gevonden"
          description={
            search
              ? `Geen projecten gevonden voor "${search}".`
              : "Maak een nieuw project aan om te beginnen."
          }
          icon={<FolderOpen className="h-6 w-6" />}
        >
          <Link href="/dashboard/projects/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuw Project
            </Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
