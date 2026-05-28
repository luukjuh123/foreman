"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listProjects } from "@/lib/projects";
import type { ProjectResponse } from "@/lib/types";
import { GanttTimeline } from "@/components/gantt/GanttTimeline";
import { GanttRow } from "@/components/gantt/GanttRow";

// ---------------------------------------------------------------------------
// Constants — match the existing single-project Gantt
// ---------------------------------------------------------------------------

const DAY_WIDTH_PX = 40;
const LABEL_WIDTH_PX = 180;

// Distinct project colors cycling through a palette
const PROJECT_COLORS = [
  "#f59e0b", // amber-400
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f97316", // orange-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#ef4444", // red-500
];

function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function collectDates(projects: ProjectResponse[]): Date[] {
  const dates: Date[] = [];
  for (const project of projects) {
    if (project.start_date) dates.push(new Date(project.start_date));
    if (project.end_date) dates.push(new Date(project.end_date));
    for (const phase of project.phases) {
      if (phase.start_date) dates.push(new Date(phase.start_date));
      if (phase.end_date) dates.push(new Date(phase.end_date));
      for (const task of phase.tasks) {
        if (task.start_date) dates.push(new Date(task.start_date));
        if (task.end_date) dates.push(new Date(task.end_date));
      }
    }
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Multi-project Gantt page
// ---------------------------------------------------------------------------

export default function MultiProjectGanttPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects(1, 100)
      .then((res) => {
        const active = res.data.filter((p) => p.status === "active");
        setProjects(active);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Compute chart date range spanning all active projects
  const { chartStart, chartEnd } = useMemo(() => {
    const dates = collectDates(projects);
    if (dates.length === 0) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      return { chartStart: now, chartEnd: end };
    }
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { chartStart: min, chartEnd: max };
  }, [projects]);

  const today = new Date();
  const todayOffset = Math.round(
    (today.getTime() - chartStart.getTime()) / 86400000
  );
  const todayLeftPx = todayOffset * DAY_WIDTH_PX;

  const totalDays =
    Math.round((chartEnd.getTime() - chartStart.getTime()) / 86400000) + 1;
  const timelineWidth = totalDays * DAY_WIDTH_PX;

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-gray-400">Laden…</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Gecombineerde Planning</h1>
        <div
          data-testid="no-active-projects"
          className="flex items-center justify-center h-40 rounded-lg border border-gray-700 bg-[#0f1117]"
        >
          <p className="text-sm text-gray-400">
            Geen actieve projecten gevonden.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Gecombineerde Planning — Alle Projecten
        </h1>
        <Link
          href="/dashboard/projects"
          className="text-sm text-amber-400 hover:underline"
        >
          ← Terug naar Projecten
        </Link>
      </div>

      {/* Chart */}
      <div className="relative flex overflow-hidden rounded-lg border border-gray-700 bg-[#0f1117]">
        {/* Fixed label column */}
        <div
          className="flex-shrink-0 border-r border-gray-700 bg-[#1a1f2e] z-20"
          style={{ width: `${LABEL_WIDTH_PX}px` }}
        >
          {/* Header spacer aligned with timeline */}
          <div className="h-10 border-b border-gray-700" />

          {projects.map((project, projectIndex) => {
            const color = getProjectColor(projectIndex);
            return (
              <React.Fragment key={project.id}>
                {/* Project header label */}
                <div
                  data-testid="project-gantt-header"
                  className="h-8 px-3 flex items-center bg-[#0f1117] border-b border-gray-700"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <span
                    className="text-xs font-bold truncate"
                    style={{ color }}
                  >
                    {project.name}
                  </span>
                </div>

                {/* Phases and tasks */}
                {project.phases.map((phase) => (
                  <React.Fragment key={phase.id}>
                    {/* Phase header label */}
                    <div className="h-8 px-3 flex items-center bg-[#1e2535] border-b border-gray-700">
                      <span className="text-xs font-semibold text-gray-300 truncate">
                        {phase.name}
                      </span>
                    </div>
                    {/* Task labels */}
                    {phase.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="h-10 px-3 flex items-center border-b border-gray-700/30"
                      >
                        <span className="text-xs text-gray-300 truncate">
                          {task.name}
                        </span>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          })}
        </div>

        {/* Scrollable timeline area */}
        <div className="overflow-x-auto overflow-y-hidden flex-1">
          <div style={{ width: `${timelineWidth}px`, minWidth: "100%" }}>
            {/* Timeline header */}
            <GanttTimeline
              startDate={chartStart}
              endDate={chartEnd}
              dayWidthPx={DAY_WIDTH_PX}
            />

            {/* Rows */}
            <div className="relative">
              {/* Today line */}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <div
                  data-testid="gantt-today-line"
                  className="absolute top-0 bottom-0 w-px bg-amber-400 z-10 opacity-70"
                  style={{ left: `${todayLeftPx}px` }}
                />
              )}

              {projects.map((project, projectIndex) => {
                const color = getProjectColor(projectIndex);
                return (
                  <React.Fragment key={project.id}>
                    {/* Project header bar row */}
                    <div
                      className="h-8 border-b border-gray-700"
                      style={{
                        width: `${timelineWidth}px`,
                        backgroundColor: `${color}18`, // very subtle tint
                      }}
                    />

                    {/* Phases */}
                    {project.phases.map((phase) => (
                      <React.Fragment key={phase.id}>
                        {/* Phase header bar row */}
                        <div
                          className="h-8 border-b border-gray-700 bg-[#1e2535]/60"
                          style={{ width: `${timelineWidth}px` }}
                        />
                        {/* Task rows — read-only (no rescheduling) */}
                        {phase.tasks.map((task) => (
                          <GanttRow
                            key={task.id}
                            task={task}
                            chartStart={chartStart}
                            dayWidthPx={DAY_WIDTH_PX}
                            onReschedule={() => {
                              // Read-only view — no rescheduling in multi-project Gantt
                            }}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
