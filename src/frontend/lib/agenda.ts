import { apiFetch } from "@/lib/api";
import type { AgendaDayResponse } from "@/lib/types";

/**
 * Fetch agenda tasks for a single day (YYYY-MM-DD).
 * If day is omitted, the backend defaults to today.
 */
export async function fetchDayAgenda(day?: string): Promise<AgendaDayResponse> {
  const qs = day ? `?day=${day}` : "";
  return apiFetch<AgendaDayResponse>(`/agenda/day${qs}`);
}

/**
 * Generate a consistent background color from a project_id string.
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
];

export function getProjectColor(projectId: string): string {
  let hash = 5381;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 33) ^ projectId.charCodeAt(i);
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}
