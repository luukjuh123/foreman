"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchWeekAgenda, getProjectColor } from "@/lib/agenda";
import type { AgendaWeekResponse, AgendaTask } from "@/lib/types";

// Dutch day abbreviations, Mon–Sun
const DUTCH_DAY_ABBR = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

// Status badge label + color
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  todo: {
    label: "Te doen",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  },
  in_progress: {
    label: "in_progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  done: {
    label: "Klaar",
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  blocked: {
    label: "Geblokkeerd",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

/** Format a YYYY-MM-DD string to dd-MM-yyyy (Dutch locale). */
function formatDutchDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Return the Monday of the week that contains the given date. */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust so Mon=0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Add/subtract days from a date and return a new Date. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Format a Date to YYYY-MM-DD. */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function TaskCard({ task }: { task: AgendaTask }) {
  const color = getProjectColor(task.project_id);
  const statusCfg = STATUS_CONFIG[task.status] ?? {
    label: task.status,
    className: "bg-slate-100 text-slate-700",
  };

  return (
    <div
      className="rounded-md p-2 mb-2 text-xs border-l-4 bg-card shadow-sm"
      style={{ borderLeftColor: color }}
    >
      <p className="font-semibold text-foreground truncate">{task.name}</p>
      <p className="text-muted-foreground truncate">{task.project_name}</p>
      <div className="flex items-center justify-between mt-1 gap-1 flex-wrap">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${statusCfg.className}`}
        >
          {statusCfg.label}
        </span>
        {task.estimated_hours > 0 && (
          <span className="text-muted-foreground">{task.estimated_hours}u</span>
        )}
      </div>
    </div>
  );
}

function DayColumn({
  dayAbbr,
  date,
  tasks,
  isToday,
}: {
  dayAbbr: string;
  date: string;
  tasks: AgendaTask[];
  isToday: boolean;
}) {
  return (
    <div className="flex-1 min-w-[120px]">
      {/* Day header */}
      <div
        className={`text-center py-2 mb-2 rounded-t-md border-b ${
          isToday
            ? "bg-primary text-primary-foreground font-bold"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <span className="block text-sm font-semibold">{dayAbbr}</span>
        <span className="block text-xs">{formatDutchDate(date)}</span>
      </div>

      {/* Task list */}
      <div className="space-y-1 px-1 min-h-[60px]">
        {tasks.map((t) => (
          <TaskCard key={t.task_id} task={t} />
        ))}
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const [weekStart, setWeekStart] = useState<string>(() =>
    toISODate(getMondayOf(new Date()))
  );
  const [data, setData] = useState<AgendaWeekResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWeekAgenda(ws);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  function goTodayWeek() {
    setWeekStart(toISODate(getMondayOf(new Date())));
  }

  function goPrevWeek() {
    setWeekStart((ws) => toISODate(addDays(new Date(ws), -7)));
  }

  function goNextWeek() {
    setWeekStart((ws) => toISODate(addDays(new Date(ws), 7)));
  }

  const todayIso = toISODate(new Date());
  const totalTasks = data?.days.reduce((sum, d) => sum + d.tasks.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrevWeek} aria-label="Vorige week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goTodayWeek}>
            Vandaag
          </Button>
          <Button variant="outline" size="sm" onClick={goNextWeek} aria-label="Volgende week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week label */}
      {data && (
        <p className="text-sm text-muted-foreground">
          Week van {formatDutchDate(data.week_start)} t/m {formatDutchDate(data.week_end)}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Laden…
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {!loading && error && (
        <Card>
          <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && totalTasks === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Geen taken gepland voor deze week.
          </CardContent>
        </Card>
      )}

      {/* 7-day grid */}
      {!loading && !error && data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">
              {totalTasks} {totalTasks === 1 ? "taak" : "taken"} deze week
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {/* Horizontal scroll on mobile, flex grid on desktop */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {data.days.map((day, idx) => (
                <DayColumn
                  key={day.date}
                  dayAbbr={DUTCH_DAY_ABBR[idx] ?? ""}
                  date={day.date}
                  tasks={day.tasks}
                  isToday={day.date === todayIso}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
