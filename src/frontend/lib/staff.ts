import { apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  StaffCreate,
  StaffListResponse,
  StaffResponse,
  StaffUpdate,
  StaffAssignmentResponse,
  StaffOutstandingBalance,
} from "./types";

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export function formatRate(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export const formatCents = formatRate;

export async function listStaff(page = 1, perPage = 20): Promise<StaffListResponse> {
  return apiFetch<StaffListResponse>(
    `/staff/?page=${page}&per_page=${perPage}`,
    { token: token() }
  );
}

export async function createStaff(data: StaffCreate): Promise<StaffResponse> {
  return apiFetch<StaffResponse>("/staff/", {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function updateStaff(id: string, data: StaffUpdate): Promise<StaffResponse> {
  return apiFetch<StaffResponse>(`/staff/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function deleteStaff(id: string): Promise<void> {
  return apiFetch<void>(`/staff/${id}`, {
    method: "DELETE",
    token: token(),
  });
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

export async function getStaffLoanBalance(staffId: string): Promise<StaffOutstandingBalance> {
  return apiFetch<StaffOutstandingBalance>(`/loans/staff/${staffId}/balance`, {
    token: token(),
  });
}
