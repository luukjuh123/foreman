import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaffResponse {
  id: string;
  owner_id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  hourly_rate_cents: number;
  weekly_hours_target: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  availability: unknown[];
}

export interface StaffListResponse {
  data: StaffResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface StaffCreate {
  full_name: string;
  role: string;
  hourly_rate_cents: number;
  email?: string;
  phone?: string;
  weekly_hours_target?: number;
  active?: boolean;
}

export interface StaffUpdate {
  full_name?: string;
  role?: string;
  hourly_rate_cents?: number;
  email?: string;
  phone?: string;
  weekly_hours_target?: number;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export function formatHourlyRate(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listStaff(page = 1, perPage = 20): Promise<StaffListResponse> {
  return apiFetch<StaffListResponse>(
    `/staff/?page=${page}&per_page=${perPage}`,
    { token: token() }
  );
}

export async function getStaff(id: string): Promise<StaffResponse> {
  return apiFetch<StaffResponse>(`/staff/${id}`, { token: token() });
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
