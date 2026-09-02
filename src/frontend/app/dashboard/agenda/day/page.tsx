"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Clock, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchDayAgenda, getProjectColor } from "@/lib/agenda";
import { AgendaDayResponse, AgendaTask } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format YYYY-MM-DD to dd-MM-yyyy */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

const DUTCH_DAY_NAMES = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

function getDutchDayName(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return DUTCH_DAY_NAMES[date.getDay()];
}

function shiftDate(isoDate: string, deltaDays: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  todo: {
    label: "Te doen",
    className: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  in_progress: {
    label: "Bezig",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  done: {
    label: "Voltooid",
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  blocked: {
    label: "Geblokkeerd",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-gray-200 text-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TaskCard({ task }: { task: AgendaTask }) {
  return (
    <Card className="mb-3">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{task.name}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{task.phase_name}</p>
          </div>
          <StatusBadge status={task.status} />
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            {task.estimated_hours} uur
          </span>

          {task.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {task.location}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Project section
// ---------------------------------------------------------------------------

interface ProjectGroup {
  project_id: string;
  project_name: string;
  tasks: AgendaTask[];
}

function ProjectSection({ group }: { group: ProjectGroup }) {
  const color = getProjectColor(group.project_id);
  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-2 rounded-t-md px-4 py-2 mb-2"
        style={{ backgroundColor: color }}
      >
        <h2 className="font-semibold text-white text-sm">{group.project_name}</h2>
        <span className="ml-auto text-white/80 text-xs">{group.tasks.length} taken</span>
      </div>
      <div>
        {group.tasks.map((task) => (
          <TaskCard key={task.task_id} task={task} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgendaDayPage() {
  const searchParams = useSearchParams();
  const [currentDay, setCurrentDay] = useState<string>(
    searchParams.get("day") ?? todayISO()
  );
  const [data, setData] = useState<AgendaDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDay = useCallback(async (day: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDayAgenda(day);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(currentDay);
  }, [currentDay, loadDay]);

  const projectGroups: ProjectGroup[] = React.useMemo(() => {
    if (!data) return [];
    const map = new Map<string, ProjectGroup>();
    for (const task of data.tasks) {
      if (!map.has(task.project_id)) {
        map.set(task.project_id, {
          project_id: task.project_id,
          project_name: task.project_name,
          tasks: [],
        });
      }
      map.get(task.project_id)!.tasks.push(task);
    }
    return Array.from(map.values());
  }, [data]);

  // Use the date from the API response when available (may differ from currentDay due to server logic)
  const displayDay = data?.date ?? currentDay;
  const dayName = getDutchDayName(displayDay);
  const formattedDate = formatDate(displayDay);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground capitalize">{dayName}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{formattedDate}</p>
        </div>

        {/* Day navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="vorige dag"
            onClick={() => setCurrentDay((d) => shiftDate(d, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDay(todayISO())}
          >
            Vandaag
          </Button>

          <Button
            variant="outline"
            size="sm"
            aria-label="volgende dag"
            onClick={() => setCurrentDay((d) => shiftDate(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 text-sm text-muted-foreground ml-2">
            <Calendar className="h-4 w-4" />
            <input
              type="date"
              value={currentDay}
              onChange={(e) => e.target.value && setCurrentDay(e.target.value)}
              className="bg-transparent border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Laden...
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card>
          <CardContent className="py-8 text-center text-red-500">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && data && data.tasks.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Geen taken voor vandaag
          </CardContent>
        </Card>
      )}

      {!loading && !error && projectGroups.length > 0 && (
        <div>
          {projectGroups.map((group) => (
            <ProjectSection key={group.project_id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
