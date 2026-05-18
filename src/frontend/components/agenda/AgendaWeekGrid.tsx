"use client";

import React, { useState, useCallback } from "react";
import { DraggableTask, type AgendaTask } from "./DraggableTask";
import { DroppableDay } from "./DroppableDay";
import { updateTask } from "@/lib/projects";

export interface AgendaDayData {
  date: string;
  tasks: AgendaTask[];
}

interface AgendaWeekGridProps {
  days: AgendaDayData[];
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Pure helper — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Given a task and a new start_date, shift end_date by the same delta
 * to preserve the original duration.
 */
export function calcNewDates(
  task: AgendaTask,
  newStartDate: string
): { start_date: string; end_date: string } {
  if (!task.start_date || !task.end_date) {
    return { start_date: newStartDate, end_date: newStartDate };
  }

  const origStart = new Date(task.start_date);
  const origEnd = new Date(task.end_date);
  const durationMs = origEnd.getTime() - origStart.getTime();

  const newStart = new Date(newStartDate);
  const newEnd = new Date(newStart.getTime() + durationMs);

  return {
    start_date: toIso(newStart),
    end_date: toIso(newEnd),
  };
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// AgendaWeekGrid
// ---------------------------------------------------------------------------

export function AgendaWeekGrid({ days, onRefresh }: AgendaWeekGridProps) {
  const [localDays, setLocalDays] = useState<AgendaDayData[]>(days);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  function showToast(message: string, error = false) {
    setToast({ message, error });
    setTimeout(() => setToast(null), 3000);
  }

  const handleDrop = useCallback(
    async (task: AgendaTask, targetDate: string) => {
      // No-op when dropped on the same day
      if (task.start_date === targetDate) return;

      const { start_date: newStart, end_date: newEnd } = calcNewDates(task, targetDate);

      // Optimistic update
      const snapshot = localDays;
      setLocalDays((prev) => {
        const next = prev.map((day) => ({
          ...day,
          tasks: day.tasks.filter((t) => t.task_id !== task.task_id),
        }));
        return next.map((day) => {
          if (day.date === targetDate) {
            return {
              ...day,
              tasks: [
                ...day.tasks,
                { ...task, start_date: newStart, end_date: newEnd },
              ],
            };
          }
          return day;
        });
      });

      try {
        await updateTask(task.project_id, task.phase_id, task.task_id, {
          start_date: newStart,
          end_date: newEnd,
        });
        showToast(`${task.name} verplaatst naar ${formatDateLabel(targetDate)}`);
        onRefresh();
      } catch {
        // Revert on error
        setLocalDays(snapshot);
        showToast(`Verplaatsen mislukt`, true);
      }
    },
    [localDays, onRefresh]
  );

  return (
    <div className="relative">
      {toast && (
        <div
          data-testid="agenda-toast"
          className={`fixed bottom-4 right-4 z-50 rounded px-4 py-2 text-sm text-white shadow-lg ${
            toast.error ? "bg-red-700" : "bg-green-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {localDays.map((day) => (
          <div key={day.date} className="flex-1 min-w-32">
            <p className="mb-1 text-center text-xs font-semibold text-gray-400">
              {formatDateLabel(day.date)}
            </p>
            <DroppableDay date={day.date} tasks={day.tasks} onDrop={handleDrop}>
              <div className="flex flex-col gap-1">
                {day.tasks.map((task) => (
                  <DraggableTask key={task.task_id} task={task} />
                ))}
              </div>
            </DroppableDay>
          </div>
        ))}
      </div>
    </div>
  );
}
