"use client";

import React, { useMemo } from "react";
import type { ProjectResponse } from "@/lib/types";
import { GanttTimeline } from "./GanttTimeline";
import { GanttRow } from "./GanttRow";
import { WeatherGanttOverlay } from "./WeatherGanttOverlay";
import type { WeatherDayDisplay } from "@/lib/weather";

const DAY_WIDTH_PX = 40;
const LABEL_WIDTH_PX = 180;

interface GanttChartProps {
  project: ProjectResponse;
  onReschedule: (
    phaseId: string,
    taskId: string,
    newStart: string,
    newEnd: string
  ) => void;
  /** Optional 7-day weather forecast to render as an overlay row */
  weatherForecast?: WeatherDayDisplay[];
}

export function GanttChart({ project, onReschedule, weatherForecast }: GanttChartProps) {
  const { chartStart, chartEnd } = useMemo(() => {
    const allDates: Date[] = [];
    for (const phase of project.phases) {
      if (phase.start_date) allDates.push(new Date(phase.start_date));
      if (phase.end_date) allDates.push(new Date(phase.end_date));
      for (const task of phase.tasks) {
        if (task.start_date) allDates.push(new Date(task.start_date));
        if (task.end_date) allDates.push(new Date(task.end_date));
      }
    }
    if (allDates.length === 0) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      return { chartStart: now, chartEnd: end };
    }
    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
    // Pad by a few days on each side
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { chartStart: min, chartEnd: max };
  }, [project]);

  const today = new Date();
  const todayOffset = Math.round(
    (today.getTime() - chartStart.getTime()) / 86400000
  );
  const todayLeftPx = todayOffset * DAY_WIDTH_PX;

  const totalDays = Math.round(
    (chartEnd.getTime() - chartStart.getTime()) / 86400000
  ) + 1;
  const timelineWidth = totalDays * DAY_WIDTH_PX;

  return (
    <div className="relative flex overflow-hidden rounded-lg border border-gray-700 bg-[#0f1117]">
      {/* Fixed label column */}
      <div
        className="flex-shrink-0 border-r border-gray-700 bg-[#1a1f2e] z-20"
        style={{ width: `${LABEL_WIDTH_PX}px` }}
      >
        {/* Header spacer to align with timeline */}
        <div className="h-10 border-b border-gray-700" />
        {project.phases.map((phase) => (
          <React.Fragment key={phase.id}>
            {/* Phase header label */}
            <div className="h-8 px-3 flex items-center bg-[#1e2535] border-b border-gray-700">
              <span className="text-xs font-bold text-amber-400 truncate">
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

          {/* Weather overlay row — only when forecast data is available */}
          {weatherForecast && weatherForecast.length > 0 && (
            <WeatherGanttOverlay
              startDate={chartStart}
              endDate={chartEnd}
              dayWidthPx={DAY_WIDTH_PX}
              forecast={weatherForecast}
            />
          )}

          {/* Rows */}
          <div className="relative">
            {/* Today line — only rendered when today falls within the chart range */}
            {todayOffset >= 0 && todayOffset <= totalDays && (
              <div
                data-testid="gantt-today-line"
                className="absolute top-0 bottom-0 w-px bg-amber-400 z-10 opacity-70"
                style={{ left: `${todayLeftPx}px` }}
              />
            )}

            {project.phases.map((phase) => (
              <React.Fragment key={phase.id}>
                {/* Phase header bar row */}
                <div
                  className="h-8 border-b border-gray-700 bg-[#1e2535]/60"
                  style={{ width: `${timelineWidth}px` }}
                />
                {/* Task rows */}
                {phase.tasks.map((task) => (
                  <GanttRow
                    key={task.id}
                    task={task}
                    chartStart={chartStart}
                    dayWidthPx={DAY_WIDTH_PX}
                    onReschedule={(taskId, newStart, newEnd) =>
                      onReschedule(phase.id, taskId, newStart, newEnd)
                    }
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
