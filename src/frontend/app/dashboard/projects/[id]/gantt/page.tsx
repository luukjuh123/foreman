"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject, updateTask } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";
import { GanttChart } from "@/components/gantt/GanttChart";

export default function GanttPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleReschedule(
    phaseId: string,
    taskId: string,
    newStart: string,
    newEnd: string
  ) {
    if (!project) return;
    try {
      await updateTask(projectId, phaseId, taskId, {
        start_date: newStart,
        end_date: newEnd,
      });
      // Optimistic update
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phases: prev.phases.map((phase) => ({
            ...phase,
            tasks: phase.tasks.map((t) =>
              t.id === taskId
                ? { ...t, start_date: newStart, end_date: newEnd }
                : t
            ),
          })),
        };
      });
    } catch {
      // silently ignore for now — could add a toast
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6 space-y-4">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar project
        </Link>
        <p className="text-destructive text-sm">{error ?? "Project niet gevonden."}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar project
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">Gantt-overzicht</p>
      </div>

      <GanttChart project={project} onReschedule={handleReschedule} />
    </div>
  );
}
