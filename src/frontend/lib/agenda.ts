import { apiFetch } from "@/lib/api";
import type { AgendaWeekResponse, AgendaDayResponse } from "@/lib/types";

/**
 * Fetch agenda tasks for the week containing week_start (YYYY-MM-DD).
 * If week_start is omitted, the backend defaults to the current week.
 */
export async function fetchWeekAgenda(weekStart?: string): Promise<AgendaWeekResponse> {
  const qs = weekStart ? `?week_start=${weekStart}` : "";
  return apiFetch<AgendaWeekResponse>(`/agenda/week${qs}`);
}

/**
 * Fetch agenda tasks for a single day (YYYY-MM-DD).
 * If day is omitted, the backend defaults to today.
 */
export async function fetchDayAgenda(day?: string): Promise<AgendaDayResponse> {
  const qs = day ? `?day=${day}` : "";
  return apiFetch<AgendaDayResponse>(`/agenda/day${qs}`);
}

/**
 * Generate a consistent, visually distinct background color from a project_id string.
 * Uses a simple djb2-style hash mapped to a curated palette of construction-themed colors.
 */
const PROJECT_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
  "#a855f7", // purple-500
];

export function getProjectColor(projectId: string): string {
  let hash = 5381;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 33) ^ projectId.charCodeAt(i);
  }
  const index = Math.abs(hash) % PROJECT_COLORS.length;
  return PROJECT_COLORS[index];
}
