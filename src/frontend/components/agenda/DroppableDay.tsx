"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgendaTask } from "./DraggableTask";

interface AgendaDay {
  date: string;
  tasks: AgendaTask[];
}

interface DroppableDayProps {
  date: string;
  tasks: AgendaTask[];
  onDrop: (task: AgendaTask, targetDate: string) => void;
  isOver?: boolean;
  children?: React.ReactNode;
}

export function DroppableDay({ date, tasks, onDrop, isOver: isOverProp, children }: DroppableDayProps) {
  const [isOver, setIsOver] = useState(false);
  const highlighted = isOverProp ?? isOver;

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(true);
  }

  function handleDragLeave() {
    setIsOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsOver(false);
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const task: AgendaTask = JSON.parse(raw);
      onDrop(task, date);
    } catch {
      // malformed data — ignore
    }
  }

  return (
    <div
      data-testid="droppable-day"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex-1 min-h-24 rounded p-2 border border-gray-700 transition-colors",
        highlighted && "ring-2 ring-blue-500 bg-blue-900/20"
      )}
    >
      {children}
    </div>
  );
}
