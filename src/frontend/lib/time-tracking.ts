import { apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  ProjectProcessListResponse,
  TimeEntryResponse,
  TimeEntryListResponse,
} from "./types";

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export async function listProjectProcesses(projectId: string): Promise<ProjectProcessListResponse> {
  return apiFetch<ProjectProcessListResponse>(`/processes/projects/${projectId}`, {
    token: token(),
  });
}

export async function startTimer(
  projectProcessId: string,
  notes?: string
): Promise<TimeEntryResponse> {
  return apiFetch<TimeEntryResponse>(`/time-tracking/${projectProcessId}/start`, {
    method: "POST",
    body: JSON.stringify({ notes }),
    token: token(),
  });
}

export async function stopTimer(
  projectProcessId: string,
  notes?: string
): Promise<TimeEntryResponse> {
  return apiFetch<TimeEntryResponse>(`/time-tracking/${projectProcessId}/stop`, {
    method: "POST",
    body: JSON.stringify({ notes }),
    token: token(),
  });
}

export async function listTimeEntries(
  projectProcessId: string
): Promise<TimeEntryListResponse> {
  return apiFetch<TimeEntryListResponse>(`/time-tracking/${projectProcessId}`, {
    token: token(),
  });
}
