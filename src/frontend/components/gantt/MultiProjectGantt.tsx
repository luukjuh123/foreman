"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProjectResponse } from "@/lib/types";
import { GanttTimeline } from "./GanttTimeline";
import { GanttRow } from "./GanttRow";

const DAY_WIDTH_PX = 32;
const PROJECT_LABEL_WIDTH_PX = 200;

// Distinct project colors — used for project header bars and task tinting
const PROJECT_COLORS = [
  { bg: "bg-blue-600", border: "border-blue-500", text: "text-blue-300", value: "blue" },
  { bg: "bg-purple-600", border: "border-purple-500", text: "text-purple-300", value: "purple" },
  { bg: "bg-teal-600", border: "border-teal-500", text: "text-teal-300", value: "teal" },
  { bg: "bg-rose-600", border: "border-rose-500", text: "text-rose-300", value: "rose" },
  { bg: "bg-orange-600", border: "border-orange-500", text: "text-orange-300", value: "orange" },
  { bg: "bg-cyan-600", border: "border-cyan-500", text: "text-cyan-300", value: "cyan" },
  { bg: "bg-lime-600", border: "border-lime-500", text: "text-lime-300", value: "lime" },
  { bg: "bg-pink-600", border: "border-pink-500", text: "text-pink-300", value: "pink" },
];

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

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

interface MultiProjectGanttProps {
  projects: ProjectResponse[];
}

export function MultiProjectGantt({ projects }: MultiProjectGanttProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { chartStart, chartEnd } = useMemo(() => {
    const dates = collectDates(projects);
    if (dates.length === 0) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 60);
      return { chartStart: now, chartEnd: end };
    }
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { chartStart: min, chartEnd: max };
  }, [projects]);

  const today = new Date();
  const todayOffset = Math.round((today.getTime() - chartStart.getTime()) / 86400000);
  const todayLeftPx = todayOffset * DAY_WIDTH_PX;

  const totalDays =
    Math.round((chartEnd.getTime() - chartStart.getTime()) / 86400000) + 1;
  const timelineWidth = totalDays * DAY_WIDTH_PX;

  if (projects.length === 0) {
    return (
      <div
        data-testid="multi-gantt-empty"
        className="flex items-center justify-center h-40 rounded-lg border border-gray-700 bg-[#0f1117] text-muted-foreground text-sm"
      >
        Geen actieve projecten gevonden.
      </div>
    );
  }

  function toggleCollapse(projectId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  return (
    <div className="relative flex overflow-hidden rounded-lg border border-gray-700 bg-[#0f1117]">
      {/* Fixed label column */}
      <div
        className="flex-shrink-0 border-r border-gray-700 bg-[#1a1f2e] z-20"
        style={{ width: `${PROJECT_LABEL_WIDTH_PX}px` }}
      >
        {/* Header spacer */}
        <div className="h-10 border-b border-gray-700" />

        {projects.map((project, projectIdx) => {
          const color = getProjectColor(projectIdx);
          const isCollapsed = collapsed.has(project.id);

          return (
            <React.Fragment key={project.id}>
              {/* Project header row label */}
              <div
                data-testid="multi-gantt-project-header"
                data-project-color={color.value}
                className={`h-9 px-2 flex items-center gap-1 border-b border-gray-700 cursor-pointer select-none ${color.bg} bg-opacity-20`}
                onClick={() => toggleCollapse(project.id)}
                role="button"
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
                )}
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`text-xs font-bold truncate ${color.text} hover:underline`}
                >
                  {project.name}
                </Link>
              </div>

              {!isCollapsed &&
                project.phases.map((phase) => (
                  <React.Fragment key={phase.id}>
                    {/* Phase label */}
                    <div className="h-7 px-3 flex items-center bg-[#1e2535] border-b border-gray-700">
                      <span className={`text-[10px] font-semibold truncate ${color.text}`}>
                        {phase.name}
                      </span>
                    </div>
                    {/* Task labels */}
                    {phase.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="h-10 px-3 flex items-center border-b border-gray-700/30"
                      >
                        <span className="text-xs text-gray-300 truncate">{task.name}</span>
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

            {projects.map((project) => {
              const isCollapsed = collapsed.has(project.id);

              return (
                <React.Fragment key={project.id}>
                  {/* Project header bar row (timeline side) */}
                  <div
                    className="h-9 border-b border-gray-700 bg-[#1e2535]/40"
                    style={{ width: `${timelineWidth}px` }}
                  />

                  {!isCollapsed &&
                    project.phases.map((phase) => (
                      <React.Fragment key={phase.id}>
                        {/* Phase header bar row */}
                        <div
                          className="h-7 border-b border-gray-700 bg-[#1e2535]/20"
                          style={{ width: `${timelineWidth}px` }}
                        />
                        {/* Task rows */}
                        {phase.tasks.map((task) => (
                          <GanttRow
                            key={task.id}
                            task={task}
                            chartStart={chartStart}
                            dayWidthPx={DAY_WIDTH_PX}
                            onReschedule={() => {
                              // Multi-project view is read-only — no rescheduling
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
  );
}
