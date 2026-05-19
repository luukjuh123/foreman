"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface AgendaTask {
  task_id: string;
  project_id: string;
  project_name: string;
  phase_id: string;
  phase_name: string;
  name: string;
  description: string | null;
  status: string;
  priority: number;
  estimated_hours: number;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
}

interface DraggableTaskProps {
  task: AgendaTask;
  isDragging?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  done: "bg-green-700 border-green-500",
  in_progress: "bg-amber-700 border-amber-500",
  todo: "bg-gray-700 border-gray-500",
  blocked: "bg-red-700 border-red-500",
};

export function DraggableTask({ task, isDragging = false }: DraggableTaskProps) {
  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    // jsdom does not implement dataTransfer methods — guard for test environments.
    try {
      e.dataTransfer.setData("application/json", JSON.stringify(task));
      e.dataTransfer.effectAllowed = "move";
    } catch {
      // safe to ignore in tests
    }
  }

  const colorClass = STATUS_COLOR[task.status] ?? "bg-gray-700 border-gray-500";

  return (
    <div
      data-testid="draggable-task"
      draggable
      onDragStart={handleDragStart}
      className={cn(
        "rounded border px-2 py-1 text-xs text-white cursor-grab select-none",
        colorClass,
        isDragging && "opacity-40"
      )}
    >
      <p className="font-medium truncate">{task.name}</p>
      <p className="text-gray-300 truncate">{task.phase_name}</p>
    </div>
  );
}
