"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBudget, formatDate, calcTaskSummary } from "@/lib/projects";
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

interface ProjectHeaderProps {
  project: ProjectResponse;
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const { done, total } = calcTaskSummary(project);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link href="/dashboard/projects">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar projecten
        </Button>
      </Link>

      {/* Header card */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: name + meta */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-2xl font-bold text-foreground"
                data-testid="project-name"
              >
                {project.name}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-sm font-medium",
                  STATUS_BADGE_CLASS[project.status] ?? "bg-gray-100 text-gray-700"
                )}
                data-testid="project-status-badge"
              >
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>

            {project.description && (
              <p className="text-muted-foreground">{project.description}</p>
            )}

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {(project.start_date || project.end_date) && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(project.start_date)} – {formatDate(project.end_date)}
                </span>
              )}
              {project.budget_cents != null && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  Budget: {formatBudget(project.budget_cents)}
                </span>
              )}
            </div>
          </div>

          {/* Right: quick actions */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href={`/dashboard/projects/${project.id}/board`}>
              <Button variant="outline" size="sm">Takenbord</Button>
            </Link>
            <Link href={`/dashboard/projects/${project.id}/gantt`}>
              <Button variant="outline" size="sm">Gantt</Button>
            </Link>
            <Link href={`/dashboard/projects/${project.id}/processes`}>
              <Button variant="outline" size="sm">Processen</Button>
            </Link>
            <Link href={`/dashboard/projects/${project.id}/timeline`}>
              <Button variant="outline" size="sm">Tijdlijn</Button>
            </Link>
          </div>
        </div>

        {/* Overall progress */}
        {total > 0 && (
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Voortgang</span>
              <span>{done}/{total} taken voltooid ({progress}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
                data-testid="overall-progress-bar"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
