import { apiFetch } from "./api";
import { token } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CertificationResponse {
  name: string;
  expiry_date: string | null;
}

export interface SubcontractorResponse {
  id: string;
  owner_id: string;
  company_name: string;
  kvk_number: string | null;
  specialties: string[];
  hourly_rate_cents: number | null;
  fixed_rate_cents: number | null;
  certifications: CertificationResponse[];
  rating: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubcontractorListResponse {
  data: SubcontractorResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface SubcontractorCreate {
  company_name: string;
  kvk_number?: string;
  specialties?: string[];
  hourly_rate_cents?: number;
  fixed_rate_cents?: number;
  certifications?: CertificationResponse[];
  active?: boolean;
}

export interface SubcontractorUpdate {
  company_name?: string;
  kvk_number?: string;
  specialties?: string[];
  hourly_rate_cents?: number;
  fixed_rate_cents?: number;
  certifications?: CertificationResponse[];
  active?: boolean;
}

export interface SubcontractorAssignment {
  id: string;
  phase_id: string;
  subcontractor_id: string;
  hourly_rate_cents: number | null;
  fixed_rate_cents: number | null;
  notes: string | null;
  created_at: string;
}

export interface SubcontractorAssignmentCreate {
  subcontractor_id: string;
  hourly_rate_cents?: number;
  fixed_rate_cents?: number;
  notes?: string;
}

export interface ProjectCostBreakdown {
  project_id: string;
  project_name: string;
  cost_cents: number;
}

export interface SubcontractorCostSummary {
  subcontractor_id: string;
  subcontractor_name: string;
  total_cost_cents: number;
  project_breakdown: ProjectCostBreakdown[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { formatEuroCents as formatRate } from "./customers";

/**
 * Returns "amber" if expiry is within 60 days, "red" if expired, null otherwise.
 */
export function certExpiryStatus(
  expiryDate: string | null
): "amber" | "red" | null {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "red";
  if (diffDays <= 60) return "amber";
  return null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listSubcontractors(
  page = 1,
  perPage = 20,
  specialty?: string
): Promise<SubcontractorListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (specialty) params.set("specialty", specialty);
  return apiFetch<SubcontractorListResponse>(
    `/subcontractors/?${params.toString()}`,
    { token: token() }
  );
}

export async function getSubcontractor(id: string): Promise<SubcontractorResponse> {
  return apiFetch<SubcontractorResponse>(`/subcontractors/${id}`, {
    token: token(),
  });
}

export async function createSubcontractor(
  data: SubcontractorCreate
): Promise<SubcontractorResponse> {
  return apiFetch<SubcontractorResponse>("/subcontractors/", {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function updateSubcontractor(
  id: string,
  data: SubcontractorUpdate
): Promise<SubcontractorResponse> {
  return apiFetch<SubcontractorResponse>(`/subcontractors/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function listPhaseAssignments(
  phaseId: string
): Promise<{ data: SubcontractorAssignment[] }> {
  return apiFetch<{ data: SubcontractorAssignment[] }>(
    `/subcontractors/assignments/phase/${phaseId}`,
    { token: token() }
  );
}

export async function assignSubcontractor(
  phaseId: string,
  data: SubcontractorAssignmentCreate
): Promise<SubcontractorAssignment> {
  return apiFetch<SubcontractorAssignment>(
    `/subcontractors/assignments/phase/${phaseId}`,
    {
      method: "POST",
      body: JSON.stringify(data),
      token: token(),
    }
  );
}

export async function getSubcontractorCosts(
  subcontractorId: string
): Promise<SubcontractorCostSummary> {
  return apiFetch<SubcontractorCostSummary>(
    `/subcontractors/${subcontractorId}/costs`,
    { token: token() }
  );
}
