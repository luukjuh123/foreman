import { apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  StaffCreate,
  StaffListResponse,
  StaffResponse,
  StaffUpdate,
} from "./types";

export function formatRate(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

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
