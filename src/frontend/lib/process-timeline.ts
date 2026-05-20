import { apiFetch } from "./api";
import type {
  ProjectProcessListResponse,
  TimeEntryListResponse,
  PhotoListResponse,
} from "./types";

export async function listProjectProcesses(
  projectId: string
): Promise<ProjectProcessListResponse> {
  return apiFetch<ProjectProcessListResponse>(`/processes/projects/${projectId}`);
}

export async function listTimeEntries(
  projectProcessId: string
): Promise<TimeEntryListResponse> {
  return apiFetch<TimeEntryListResponse>(`/time-tracking/${projectProcessId}`);
}

export async function listProjectPhotos(
  projectId: string
): Promise<PhotoListResponse> {
  return apiFetch<PhotoListResponse>(`/photos/projects/${projectId}`);
}
