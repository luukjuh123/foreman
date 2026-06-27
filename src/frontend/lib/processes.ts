import { apiFetch } from "./api";
import { token } from "./auth";
import type {
  ProcessCreate,
  ProcessListResponse,
  ProcessResponse,
  ProcessStatsListResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} u ${minutes} min`;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function listProcesses(): Promise<ProcessListResponse> {
  return apiFetch<ProcessListResponse>("/processes/", { token: token() });
}

export async function listProcessStats(): Promise<ProcessStatsListResponse> {
  return apiFetch<ProcessStatsListResponse>("/processes/stats", { token: token() });
}

export async function createProcess(data: ProcessCreate): Promise<ProcessResponse> {
  return apiFetch<ProcessResponse>("/processes/", {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}
