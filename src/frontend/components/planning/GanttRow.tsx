"use client";

import React, { useState } from "react";
import type { TaskResponse, PhaseResponse } from "@/lib/types";

interface GanttRowProps {
  phase: PhaseResponse;
  tasks: TaskResponse[];
  chartStart: Date;
  dayWidthPx: number;
  projectColor: string;
}

const STATUS_OPACITY: Record<string, string> = {
  done: "opacity-100",
  in_progress: "opacity-90",
  todo: "opacity-70",
  blocked: "opacity-60",
};

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatDutch(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

interface TooltipState {
  taskId: string;
  x: number;
  y: number;
}

export function GanttRow({ phase, tasks, chartStart, dayWidthPx, projectColor }: GanttRowProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const tasksWithDates = tasks.filter((t) => t.start_date && t.end_date);
  const tasksWithoutDates = tasks.filter((t) => !t.start_date || !t.end_date);

  // Phase bar dimensions
  const phaseStart = phase.start_date ? new Date(phase.start_date) : null;
  const phaseEnd = phase.end_date ? new Date(phase.end_date) : null;
  let phaseLeftPx = 0;
  let phaseWidthPx = 0;
  if (phaseStart && phaseEnd) {
    const offsetDays = daysBetween(chartStart, phaseStart);
    const durationDays = daysBetween(phaseStart, phaseEnd) + 1;
    phaseLeftPx = offsetDays * dayWidthPx;
    phaseWidthPx = Math.max(durationDays * dayWidthPx, dayWidthPx);
  }

  return (
    <>
      {/* Phase header row */}
      <div className="relative h-7 border-b border-gray-700/50 bg-[#1e2535]/80">
        {phaseWidthPx > 0 && (
          <div
            className="absolute top-1 h-5 rounded-sm flex items-center px-2 text-[10px] font-bold text-white/80 overflow-hidden"
            style={{
              left: `${phaseLeftPx}px`,
              width: `${phaseWidthPx}px`,
              backgroundColor: projectColor,
              opacity: 0.4,
            }}
          >
            <span className="truncate">{phase.name}</span>
          </div>
        )}
      </div>

      {/* Task rows */}
      {tasksWithDates.map((task) => {
        const taskStart = new Date(task.start_date!);
        const taskEnd = new Date(task.end_date!);
        const offsetDays = daysBetween(chartStart, taskStart);
        const durationDays = daysBetween(taskStart, taskEnd) + 1;
        const leftPx = offsetDays * dayWidthPx;
        const widthPx = Math.max(durationDays * dayWidthPx, dayWidthPx);
        const opacityClass = STATUS_OPACITY[task.status] ?? "opacity-70";
        const tooltipText = `${task.name}: ${formatDutch(task.start_date!)} – ${formatDutch(task.end_date!)}`;

        return (
          <div
            key={task.id}
            className="relative h-9 border-b border-gray-700/20"
          >
            <div
              data-testid="multi-gantt-task-bar"
              title={tooltipText}
              className={`absolute top-1 h-7 rounded cursor-pointer select-none flex items-center px-2 text-[11px] text-white font-medium overflow-hidden transition-opacity hover:opacity-100 ${opacityClass}`}
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
                backgroundColor: projectColor,
              }}
              onClick={(e) => {
                setTooltip(
                  tooltip?.taskId === task.id
                    ? null
                    : { taskId: task.id, x: e.clientX, y: e.clientY }
                );
              }}
            >
              <span className="truncate">{task.name}</span>
            </div>

            {/* Popover for this task */}
            {tooltip?.taskId === task.id && (
              <div
                data-testid="task-popover"
                className="fixed z-50 bg-[#1a1f2e] border border-gray-600 rounded-lg shadow-xl p-3 text-xs text-gray-200 min-w-[180px]"
                style={{ left: `${tooltip.x + 8}px`, top: `${tooltip.y - 10}px` }}
              >
                <p className="font-semibold text-white mb-1">{task.name}</p>
                <p>
                  {formatDutch(task.start_date!)} – {formatDutch(task.end_date!)}
                </p>
                <p className="mt-1 capitalize text-gray-400">{task.status.replace("_", " ")}</p>
                <button
                  className="absolute top-1 right-2 text-gray-500 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTooltip(null);
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Tasks without dates — show as placeholder rows */}
      {tasksWithoutDates.map((task) => (
        <div
          key={task.id}
          className="relative h-9 border-b border-gray-700/20 flex items-center px-2"
        >
          <span className="text-[11px] text-gray-600 italic">{task.name} — geen datum</span>
        </div>
      ))}
    </>
  );
}
