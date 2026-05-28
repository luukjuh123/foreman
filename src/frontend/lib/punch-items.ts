import { apiFetch } from "./api";

export type PunchItemStatus = "open" | "fixed" | "verified";

export interface PunchItemResponse {
  id: string;
  project_id: string;
  task_id: string | null;
  description: string;
  status: PunchItemStatus;
  assigned_staff_id: string | null;
  photo_before_url: string | null;
  photo_after_url: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface PunchItemListResponse {
  data: PunchItemResponse[];
  total: number;
}

export interface PunchItemCreate {
  task_id?: string | null;
  description: string;
  status?: PunchItemStatus;
  assigned_staff_id?: string | null;
  photo_before_url?: string | null;
  photo_after_url?: string | null;
}

export interface PunchItemUpdate {
  description?: string;
  status?: PunchItemStatus;
  assigned_staff_id?: string | null;
  photo_before_url?: string | null;
  photo_after_url?: string | null;
}

export interface PunchItemSummary {
  task_id: string | null;
  task_name: string | null;
  open: number;
  fixed: number;
  verified: number;
  total: number;
}

export async function listPunchItems(
  projectId: string,
  status?: PunchItemStatus
): Promise<PunchItemListResponse> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<PunchItemListResponse>(`/projects/${projectId}/punch-items${qs}`);
}

export async function createPunchItem(
  projectId: string,
  body: PunchItemCreate
): Promise<PunchItemResponse> {
  return apiFetch<PunchItemResponse>(`/projects/${projectId}/punch-items`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePunchItem(
  projectId: string,
  itemId: string,
  body: PunchItemUpdate
): Promise<PunchItemResponse> {
  return apiFetch<PunchItemResponse>(`/projects/${projectId}/punch-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deletePunchItem(projectId: string, itemId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}/punch-items/${itemId}`, {
    method: "DELETE",
  });
}

export async function getPunchItemsSummary(projectId: string): Promise<PunchItemSummary[]> {
  return apiFetch<PunchItemSummary[]>(`/projects/${projectId}/punch-items/summary`);
}
