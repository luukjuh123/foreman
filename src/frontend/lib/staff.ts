import { apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  StaffListResponse,
  StaffAssignmentResponse,
} from "./types";

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export async function listStaff(page = 1, perPage = 20): Promise<StaffListResponse> {
  return apiFetch<StaffListResponse>(
    `/staff/?page=${page}&per_page=${perPage}`,
    { token: token() }
  );
}

export async function listAssignments({
  staffId,
  projectId,
}: {
  staffId?: string;
  projectId?: string;
} = {}): Promise<StaffAssignmentResponse[]> {
  const params = new URLSearchParams();
  if (staffId) params.set("staff_id", staffId);
  if (projectId) params.set("project_id", projectId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<StaffAssignmentResponse[]>(`/assignments/${qs}`);
}
