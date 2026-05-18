"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProject, calcPhaseProgress, formatBudget, formatDate } from "@/lib/projects";
import type { ProjectResponse, PhaseResponse, TaskResponse } from "@/lib/types";

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

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Te doen",
  in_progress: "Bezig",
  done: "Klaar",
  blocked: "Geblokkeerd",
};

const TASK_STATUS_CLASS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
};

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task }: { task: TaskResponse }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/40">
      <span className="text-sm">{task.name}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          TASK_STATUS_CLASS[task.status] ?? "bg-gray-100 text-gray-600"
        )}
      >
        {TASK_STATUS_LABELS[task.status] ?? task.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase card (expandable)
// ---------------------------------------------------------------------------

function PhaseCard({ phase }: { phase: PhaseResponse }) {
  const [expanded, setExpanded] = useState(false);
  const progress = calcPhaseProgress(phase);
  const done = phase.tasks.filter((t) => t.status === "done").length;
  const total = phase.tasks.length;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <CardTitle className="text-base">{phase.name}</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {done}/{total} taken
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>

      {expanded && phase.tasks.length > 0 && (
        <CardContent className="space-y-1.5 pt-0">
          {phase.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      getProject(id)
        .then(setProject)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Laden…</p>;
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Terug
          </Button>
        </Link>
        <p className="text-sm text-destructive">{error ?? "Project niet gevonden."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/dashboard/projects">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Terug naar projecten
        </Button>
      </Link>

      {/* Project header */}
      <div className="space-y-2">
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
            <span>Budget: {formatBudget(project.budget_cents)}</span>
          )}
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Fases</h2>
        {project.phases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen fases toegevoegd.</p>
        ) : (
          project.phases.map((phase) => <PhaseCard key={phase.id} phase={phase} />)
        )}
      </div>
    </div>
  );
}
