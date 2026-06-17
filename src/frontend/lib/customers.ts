import { apiFetch } from "./api";
import { getAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerListResponse {
  data: CustomerResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface CustomerCreate {
  name: string;
  email?: string;
  phone?: string;
  kvk_number?: string;
  vat_number?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  city?: string;
  country_code?: string;
  notes?: string;
}

export interface CustomerUpdate {
  name?: string;
  email?: string;
  phone?: string;
  kvk_number?: string;
  vat_number?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  city?: string;
  country_code?: string;
  notes?: string;
}

export interface InvoiceSummaryItem {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  total_cents: number;
}

export interface ProjectSummaryItem {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface CustomerSummaryResponse {
  id: string;
  name: string;
  projects: ProjectSummaryItem[];
  invoices: InvoiceSummaryItem[];
  outstanding_cents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

/** Format euro cents as Dutch locale currency string, e.g. € 1.234,56 */
export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listCustomers(
  page = 1,
  perPage = 20,
  search?: string
): Promise<CustomerListResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (search) params.set("search", search);
  return apiFetch<CustomerListResponse>(`/customers/?${params}`, { token: token() });
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

export async function updateCustomer(id: string, data: CustomerUpdate): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>(`/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  return apiFetch<void>(`/customers/${id}`, {
    method: "DELETE",
    token: token(),
  });
}
