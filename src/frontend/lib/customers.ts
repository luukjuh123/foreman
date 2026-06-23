import { apiFetch } from "./api";
import { token } from "./auth";
import type { CustomerResponse, CustomerCreate, CustomerUpdate } from "./types";

// Re-export types so pages can import them from "@/lib/customers"
export type { CustomerResponse, CustomerCreate, CustomerUpdate };

// ---------------------------------------------------------------------------
// Customer summary types
// ---------------------------------------------------------------------------

export interface CustomerProjectSummary {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface CustomerInvoiceSummary {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  total_cents: number;
}

export interface CustomerSummaryResponse {
  outstanding_cents: number;
  projects: CustomerProjectSummary[];
  invoices: CustomerInvoiceSummary[];
}

// ---------------------------------------------------------------------------
// Paginated list response
// ---------------------------------------------------------------------------

export interface PaginatedCustomers {
  data: CustomerResponse[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format euro cents as Dutch locale currency string, e.g. € 1.234,56 */
export function formatEuroCents(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(euros);
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listCustomers(
  page = 1,
  perPage = 20,
  query?: string
): Promise<PaginatedCustomers> {
  const params = new URLSearchParams({
    skip: String((page - 1) * perPage),
    limit: String(perPage),
  });
  if (query) params.set("q", query);
  const data = await apiFetch<CustomerResponse[]>(`/customers/?${params.toString()}`, {
    token: token(),
  });
  // Backend returns plain array; wrap in paginated shape
  return { data, total: data.length };
}

export async function getCustomer(id: string): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>(`/customers/${id}`, { token: token() });
}

export async function getCustomerSummary(id: string): Promise<CustomerSummaryResponse> {
  return apiFetch<CustomerSummaryResponse>(`/customers/${id}/summary`, { token: token() });
}

export async function createCustomer(data: CustomerCreate): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>("/customers/", {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function updateCustomer(
  id: string,
  data: CustomerUpdate
): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>(`/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiFetch<void>(`/customers/${id}`, {
    method: "DELETE",
    token: token(),
  });
}
