import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, TrendingUp } from "lucide-react";
import { formatBudget, formatDate } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function calcProjectProgress(project: ProjectResponse): number {
  const tasks = (project.phases ?? []).flatMap((ph) => ph.tasks ?? []);
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

function getNextMilestone(project: ProjectResponse): string | null {
  const allTasks = (project.phases ?? []).flatMap((ph) => ph.tasks ?? []);
  const upcoming = allTasks
    .filter((t) => t.status !== "done" && t.end_date)
    .sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1));
  return upcoming[0]?.end_date ?? null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  active: "Actief",
  completed: "Afgerond",
  archived: "Gearchiveerd",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  active: "default",
  completed: "outline",
  archived: "outline",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface ActiveProjectCardProps {
  project: ProjectResponse;
}

export function ActiveProjectCard({ project }: ActiveProjectCardProps) {
  const progress = calcProjectProgress(project);
  const nextMilestone = getNextMilestone(project);
  const budgetLabel = project.budget_cents
    ? formatBudget(project.budget_cents)
    : null;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      <Card className="group cursor-pointer transition-shadow hover:shadow-md hover:border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <Badge
              variant={STATUS_VARIANTS[project.status] ?? "secondary"}
              className="shrink-0 text-xs"
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Voortgang</span>
              <span className="text-xs font-medium">{progress}%</span>
            </div>
            <div
              className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                data-testid="project-progress-bar"
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Budget + milestone row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
            {budgetLabel ? (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 shrink-0" />
                <span className="truncate">{budgetLabel}</span>
              </span>
            ) : (
              <span />
            )}

            {nextMilestone && (
              <span className="flex items-center gap-1 shrink-0">
                <CalendarDays className="h-3 w-3" />
                {formatDate(nextMilestone)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
