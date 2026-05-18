import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

export interface PlanningProposal {
  task_id: string;
  proposed_start_date: string;
  proposed_end_date: string;
  reasoning: string;
  is_critical: boolean;
}

export interface AutofillRequest {
  project_id: string;
  start_date: string;
  working_hours_per_day?: number;
}

export interface AutofillResponse {
  proposals: PlanningProposal[];
}

export interface ApplyRequest {
  project_id: string;
  task_ids: string[];
  start_date: string;
}

export interface ApplyResponse {
  updated_count: number;
}

export async function autofillPlanning(req: AutofillRequest): Promise<AutofillResponse> {
  const token = getAccessToken() ?? undefined;
  return apiFetch<AutofillResponse>("/planning/autofill", {
    method: "POST",
    body: JSON.stringify(req),
    token,
  });
}

export async function applyPlanning(req: ApplyRequest): Promise<ApplyResponse> {
  const token = getAccessToken() ?? undefined;
  return apiFetch<ApplyResponse>("/planning/apply", {
    method: "POST",
    body: JSON.stringify(req),
    token,
  });
}
