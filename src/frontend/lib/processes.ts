import { apiFetch } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface ProcessListResponse {
  data: ProcessResponse[];
  total: number;
}

export interface ProcessStatsResponse {
  process_id: string;
  process_slug: string;
  process_name: string;
  entry_count: number;
  project_count: number;
  total_seconds: number;
  avg_seconds: number | null;
}

export interface ProcessStatsListResponse {
  data: ProcessStatsResponse[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds === 0) return "Geen data";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}u ${m}min` : `${h}u`;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listProcesses(): Promise<ProcessListResponse> {
  return apiFetch<ProcessListResponse>("/processes/");
}

export async function listProcessStats(): Promise<ProcessStatsListResponse> {
  return apiFetch<ProcessStatsListResponse>("/processes/stats");
}
