"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";
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
// Project card
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectResponse }) {
  const summary = calcTaskSummary(project);
  const totalPhases = project.phases.length;
  const donePhases = project.phases.filter((p) => p.status === "completed" || p.status === "done").length;
  const phasePercent = totalPhases > 0 ? Math.round((donePhases / totalPhases) * 100) : 0;

  return (
    <Link href={`/dashboard/projects/${project.id}`} aria-label={project.name}>
      <Card className="h-full cursor-pointer hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">{project.name}</CardTitle>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_BADGE_CLASS[project.status] ?? "bg-gray-100 text-gray-700"
              )}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2 text-sm">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Date range */}
          {(project.start_date || project.end_date) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                {formatDate(project.start_date)} – {formatDate(project.end_date)}
              </span>
            </div>
          )}

          {/* Budget */}
          {project.budget_cents != null && (
            <p className="text-xs text-muted-foreground">
              Budget: {formatBudget(project.budget_cents)}
            </p>
          )}

          {/* Phase progress bar */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Fases</span>
              <span>{donePhases}/{totalPhases}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${phasePercent}%` }}
              />
            </div>
          </div>

          {/* Task summary */}
          <p className="text-xs text-muted-foreground">
            {summary.done}/{summary.total} taken voltooid
          </p>
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

  useEffect(() => {
    listProjects(1, 50)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all"
    ? projects
    : projects.filter((p) => p.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Projecten</h1>
        <Link href="/dashboard/projects/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuw Project
          </Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
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

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen projecten gevonden.</p>
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
