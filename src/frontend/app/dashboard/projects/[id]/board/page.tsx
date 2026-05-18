"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getProject, updateTask } from "@/lib/projects";
import type { ProjectResponse, PhaseResponse, TaskResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUSES = ["todo", "in_progress", "done", "blocked"] as const;
type Status = (typeof STATUSES)[number];

const COLUMN_LABELS: Record<Status, string> = {
  todo: "Te Doen",
  in_progress: "In Uitvoering",
  done: "Voltooid",
  blocked: "Geblokkeerd",
};

const COLUMN_COLORS: Record<Status, string> = {
  todo: "bg-gray-400",
  in_progress: "bg-blue-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<number, string> = {
  0: "Laag",
  1: "Normaal",
  2: "Hoog",
  3: "Urgent",
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-green-100 text-green-800",
  1: "bg-gray-100 text-gray-700",
  2: "bg-orange-100 text-orange-800",
  3: "bg-red-100 text-red-800",
};

function priorityLabel(p: number): string {
  return PRIORITY_LABELS[p] ?? `P${p}`;
}

function priorityColor(p: number): string {
  return PRIORITY_COLORS[p] ?? "bg-gray-100 text-gray-700";
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: TaskResponse;
  projectId: string;
  phaseId: string;
  onMoved: (taskId: string, newStatus: Status) => void;
}

function TaskCard({ task, projectId, phaseId, onMoved }: TaskCardProps) {
  const [moving, setMoving] = useState(false);

  const currentIndex = STATUSES.indexOf(task.status as Status);
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex < STATUSES.length - 1;

  async function move(direction: "left" | "right") {
    const newIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
    const newStatus = STATUSES[newIndex];
    setMoving(true);
    try {
      await updateTask(projectId, phaseId, task.id, { status: newStatus });
      onMoved(task.id, newStatus);
    } finally {
      setMoving(false);
    }
  }

  return (
    <Card className="mb-2 shadow-sm">
      <CardContent className="p-3">
        <p className="font-medium text-sm mb-2">{task.name}</p>
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              priorityColor(task.priority)
            )}
          >
            {priorityLabel(task.priority)}
          </span>
          {task.estimated_hours != null && (
            <span className="text-xs text-muted-foreground">
              {task.estimated_hours} uur
            </span>
          )}
        </div>
        <div className="flex gap-1 mt-2 justify-end">
          {canMoveLeft && (
            <button
              aria-label="→ terug"
              disabled={moving}
              onClick={() => move("left")}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {canMoveRight && (
            <button
              aria-label="→ vooruit"
              disabled={moving}
              onClick={() => move("right")}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// KanbanColumn
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  status: Status;
  tasks: TaskResponse[];
  projectId: string;
  phaseId: string;
  onMoved: (taskId: string, newStatus: Status) => void;
}

function KanbanColumn({ status, tasks, projectId, phaseId, onMoved }: KanbanColumnProps) {
  return (
    <div className="flex flex-col flex-1 min-w-[220px]">
      <div className={cn("rounded-t-lg px-3 py-2", COLUMN_COLORS[status])}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-sm">
            {COLUMN_LABELS[status]}
          </span>
          <span
            data-testid="column-count"
            className="bg-white/30 text-white text-xs font-bold rounded-full px-2 py-0.5"
          >
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="flex-1 rounded-b-lg border border-t-0 bg-gray-50 p-2 min-h-[120px]">
        {tasks.length === 0 ? (
          <p
            data-testid="empty-column"
            className="text-xs text-muted-foreground text-center mt-4"
          >
            Geen taken
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              phaseId={phaseId}
              onMoved={onMoved}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KanbanBoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  useEffect(() => {
    getProject(projectId)
      .then((p) => {
        setProject(p);
        if (p.phases.length > 0) {
          setSelectedPhaseId(p.phases[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  function handleMoved(taskId: string, newStatus: Status) {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: prev.phases.map((phase) => ({
          ...phase,
          tasks: phase.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          ),
        })),
      };
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-destructive">Project niet gevonden.</p>
      </div>
    );
  }

  const selectedPhase: PhaseResponse | undefined = project.phases.find(
    (ph) => ph.id === selectedPhaseId
  );

  const tasksByStatus = (phase: PhaseResponse | undefined): Record<Status, TaskResponse[]> => {
    const empty: Record<Status, TaskResponse[]> = {
      todo: [],
      in_progress: [],
      done: [],
      blocked: [],
    };
    if (!phase) return empty;
    for (const task of phase.tasks) {
      const s = task.status as Status;
      if (s in empty) {
        empty[s].push(task);
      }
    }
    return empty;
  };

  const columns = tasksByStatus(selectedPhase);

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
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">Takenbord</p>
      </div>

      {/* Phase selector */}
      {project.phases.length > 0 && (
        <div className="flex gap-2 flex-wrap border-b pb-2">
          {project.phases.map((phase) => (
            <button
              key={phase.id}
              onClick={() => setSelectedPhaseId(phase.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                selectedPhaseId === phase.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {phase.name}
            </button>
          ))}
        </div>
      )}

      {/* Kanban columns */}
      {selectedPhase ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columns[status]}
              projectId={projectId}
              phaseId={selectedPhase.id}
              onMoved={handleMoved}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Geen fases gevonden.</p>
      )}
    </div>
  );
}
