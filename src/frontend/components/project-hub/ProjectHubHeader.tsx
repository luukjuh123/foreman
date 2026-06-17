"use client";

import Link from "next/link";
import { Calendar, Euro, CheckCircle2, PlusCircle, FileText, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBudget, formatDate } from "@/lib/projects";
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
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  archived: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  project: ProjectResponse;
}

export function ProjectHubHeader({ project }: Props) {
  // Compute inline to avoid dependency on unmocked calcTaskSummary in tests
  const allTasks = (project.phases ?? []).flatMap((p) => p.tasks ?? []);
  const done = allTasks.filter((t) => t.status === "done").length;
  const total = allTasks.length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Name + status badge row */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-sm font-medium",
            STATUS_BADGE_CLASS[project.status] ?? "bg-gray-100 text-gray-700"
          )}
        >
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
      </div>

      {project.description && (
        <p className="text-muted-foreground text-sm">{project.description}</p>
      )}

      {/* Meta row: dates, budget, completion */}
      <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
        {(project.start_date || project.end_date) && (
          <span
            data-testid="project-dates"
            className="flex items-center gap-1.5"
          >
            <Calendar className="h-4 w-4 shrink-0" />
            {formatDate(project.start_date)} – {formatDate(project.end_date)}
          </span>
        )}

        {project.budget_cents != null && (
          <span
            data-testid="project-budget"
            className="flex items-center gap-1.5"
          >
            <Euro className="h-4 w-4 shrink-0" />
            Budget: {formatBudget(project.budget_cents)}
          </span>
        )}

        <span
          data-testid="project-completion"
          className="flex items-center gap-1.5"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {completionPct}% voltooid — {done} van {total} taken klaar
        </span>
      </div>

      {/* Budget progress bar */}
      {project.budget_cents != null && (
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(completionPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/projects/${project.id}/board`}>
          <Button size="sm" variant="default">
            <PlusCircle className="mr-1.5 h-4 w-4" />
            Nieuwe taak
          </Button>
        </Link>
        <Link href={`/dashboard/invoices/new?project_id=${project.id}`}>
          <Button size="sm" variant="outline">
            <FileText className="mr-1.5 h-4 w-4" />
            Factuur maken
          </Button>
        </Link>
        <Link href={`/dashboard/reports?project_id=${project.id}`}>
          <Button size="sm" variant="outline">
            <BarChart2 className="mr-1.5 h-4 w-4" />
            Rapport
          </Button>
        </Link>
      </div>
    </div>
  );
}
