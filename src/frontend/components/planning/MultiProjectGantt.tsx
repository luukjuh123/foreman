"use client";

import React, { useMemo } from "react";
import type { ProjectResponse } from "@/lib/types";
import { GanttTimeline, type ZoomLevel } from "./GanttTimeline";
import { GanttRow } from "./GanttRow";

const LABEL_WIDTH_PX = 200;

const PROJECT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
];

const ZOOM_DAY_WIDTH: Record<ZoomLevel, number> = {
  week: 40,
  month: 20,
  quarter: 8,
};

interface MultiProjectGanttProps {
  projects: ProjectResponse[];
  zoomLevel: ZoomLevel;
  onProjectClick?: (projectId: string) => void;
}

export function MultiProjectGantt({ projects, zoomLevel, onProjectClick }: MultiProjectGanttProps) {
  const dayWidthPx = ZOOM_DAY_WIDTH[zoomLevel];

  const { chartStart, chartEnd } = useMemo(() => {
    const allDates: Date[] = [];
    for (const project of projects) {
      if (project.start_date) allDates.push(new Date(project.start_date));
      if (project.end_date) allDates.push(new Date(project.end_date));
      for (const phase of project.phases) {
        if (phase.start_date) allDates.push(new Date(phase.start_date));
        if (phase.end_date) allDates.push(new Date(phase.end_date));
        for (const task of phase.tasks) {
          if (task.start_date) allDates.push(new Date(task.start_date));
          if (task.end_date) allDates.push(new Date(task.end_date));
        }
      }
    }

    // Always include today in the range
    allDates.push(new Date());

    if (allDates.length === 0) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 90);
      return { chartStart: now, chartEnd: end };
    }

    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 3);
    return { chartStart: min, chartEnd: max };
  }, [projects]);

  const today = new Date();
  const totalDays = Math.round((chartEnd.getTime() - chartStart.getTime()) / 86400000) + 1;
  const timelineWidth = totalDays * dayWidthPx;

  const todayOffsetDays = Math.round((today.getTime() - chartStart.getTime()) / 86400000);
  const todayLeftPx = todayOffsetDays * dayWidthPx;
  const showTodayLine = todayOffsetDays >= 0 && todayOffsetDays <= totalDays;

  return (
    <div className="relative flex overflow-hidden rounded-lg border border-gray-700 bg-[#0f1117]">
      {/* Fixed label column */}
      <div
        className="flex-shrink-0 border-r border-gray-700 bg-[#1a1f2e] z-20 overflow-y-auto"
        style={{ width: `${LABEL_WIDTH_PX}px` }}
      >
        {/* Header spacer */}
        <div className="h-10 border-b border-gray-700" />

        {projects.map((project, idx) => {
          const color = PROJECT_COLORS[idx % PROJECT_COLORS.length];
          return (
            <div key={project.id} data-testid="project-swimlane">
              {/* Project name row */}
              <div
                className="h-9 px-3 flex items-center gap-2 cursor-pointer border-b border-gray-700 hover:bg-[#252b3b] transition-colors"
                style={{ borderLeft: `3px solid ${color}` }}
                onClick={() => onProjectClick?.(project.id)}
              >
                <span className="text-xs font-bold text-white truncate">{project.name}</span>
              </div>

              {/* Phase + task rows */}
              {project.phases.map((phase) => (
                <div key={phase.id}>
                  {/* Phase label */}
                  <div className="h-7 px-3 flex items-center bg-[#1e2535]/80 border-b border-gray-700/50">
                    <span className="text-[10px] font-semibold text-gray-400 truncate">
                      {phase.name}
                    </span>
                  </div>

                  {/* Task labels */}
                  {phase.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="h-9 px-4 flex items-center border-b border-gray-700/20"
                    >
                      <span className="text-[11px] text-gray-400 truncate">{task.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline area */}
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <div style={{ width: `${timelineWidth}px`, minWidth: "100%" }}>
          <GanttTimeline
            startDate={chartStart}
            endDate={chartEnd}
            dayWidthPx={dayWidthPx}
            zoomLevel={zoomLevel}
          />

          {/* Chart body */}
          <div className="relative">
            {/* Today line */}
            {showTodayLine && (
              <div
                data-testid="multi-gantt-today-line"
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 opacity-80"
                style={{ left: `${todayLeftPx}px` }}
              />
            )}

            {projects.map((project, idx) => {
              const color = PROJECT_COLORS[idx % PROJECT_COLORS.length];
              return (
                <div key={project.id}>
                  {/* Project header row */}
                  <div
                    className="h-9 border-b border-gray-700"
                    style={{ width: `${timelineWidth}px`, backgroundColor: `${color}18` }}
                  />

                  {/* Phases */}
                  {project.phases.map((phase) => (
                    <GanttRow
                      key={phase.id}
                      phase={phase}
                      tasks={phase.tasks}
                      chartStart={chartStart}
                      dayWidthPx={dayWidthPx}
                      projectColor={color}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
