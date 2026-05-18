"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import type { TaskResponse } from "@/lib/types";

interface GanttRowProps {
  task: TaskResponse;
  chartStart: Date;
  dayWidthPx: number;
  onReschedule: (taskId: string, newStart: string, newEnd: string) => void;
  isCritical?: boolean;
}

const STATUS_BAR_CLASS: Record<string, string> = {
  done: "bg-green-600",
  in_progress: "bg-amber-500",
  todo: "bg-gray-500",
  blocked: "bg-red-600",
};

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDutch(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function GanttRow({
  task,
  chartStart,
  dayWidthPx,
  onReschedule,
  isCritical = false,
}: GanttRowProps) {
  if (!task.start_date || !task.end_date) {
    return (
      <div
        data-testid="gantt-row-container"
        className="relative h-10 border-b border-gray-700/30 flex items-center px-2"
      >
        <span data-testid="gantt-no-date" className="text-xs text-gray-500 italic">
          {task.name} — geen datum
        </span>
      </div>
    );
  }

  const taskStart = new Date(task.start_date);
  const taskEnd = new Date(task.end_date);
  const offsetDays = daysBetween(chartStart, taskStart);
  const durationDays = daysBetween(taskStart, taskEnd) + 1;

  const leftPx = offsetDays * dayWidthPx;
  const widthPx = Math.max(durationDays * dayWidthPx, dayWidthPx);

  const barColorClass = STATUS_BAR_CLASS[task.status] ?? "bg-gray-500";
  const tooltipText = `${task.name}: ${formatDutch(task.start_date)} – ${formatDutch(task.end_date)}`;

  // Store drag-start clientX on the bar DOM element so handleDrop can read it.
  // jsdom does not deliver clientX on drag events, but dataset reads/writes work.
  const barRef = useRef<HTMLDivElement>(null);

  function handleDragStart(e: React.DragEvent) {
    if (barRef.current) {
      barRef.current.dataset.dragStartX = String(e.clientX ?? 0);
    }
    // setDragImage exists in jsdom but throws internally — use try/catch.
    try {
      const ghost = document.createElement("div");
      ghost.style.position = "absolute";
      ghost.style.top = "-9999px";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => document.body.removeChild(ghost), 0);
    } catch {
      // jsdom does not implement setDragImage; safe to ignore in tests.
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const startX = parseFloat(barRef.current?.dataset.dragStartX ?? "0");
    const dropX = e.clientX ?? 0;
    const deltaX = dropX - startX;
    const deltaDays = Math.round(deltaX / dayWidthPx);
    if (deltaDays === 0) return;

    const newStart = new Date(taskStart);
    newStart.setDate(newStart.getDate() + deltaDays);
    const newEnd = new Date(taskEnd);
    newEnd.setDate(newEnd.getDate() + deltaDays);

    onReschedule(task.id, toIso(newStart), toIso(newEnd));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div
      data-testid="gantt-row-container"
      className="relative h-10 border-b border-gray-700/30"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div
        ref={barRef}
        data-testid="gantt-task-bar"
        draggable
        onDragStart={handleDragStart}
        title={tooltipText}
        className={cn(
          "absolute top-1 h-8 rounded cursor-grab select-none flex items-center px-2 text-xs text-white font-medium overflow-hidden",
          barColorClass,
          isCritical && "border-2 border-red-400"
        )}
        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      >
        <span className="truncate">{task.name}</span>
      </div>
    </div>
  );
}
