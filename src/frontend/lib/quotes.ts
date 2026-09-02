import { apiFetch } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface QuoteLineResponse {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
  line_net_cents: number;
  line_vat_cents: number;
}

export interface QuoteResponse {
  id: string;
  customer_id: string;
  project_id: string | null;
  quote_number: string;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  lines: QuoteLineResponse[];
}

export interface QuoteListResponse {
  data: QuoteResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface QuoteLineCreate {
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
}

export interface QuoteCreate {
  customer_id: string;
  project_id?: string;
  valid_until?: string;
  notes?: string;
  lines: QuoteLineCreate[];
}

export interface QuoteUpdate {
  customer_id?: string;
  project_id?: string;
  valid_until?: string;
  notes?: string;
  lines?: QuoteLineCreate[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}-${m}-${y}`;
}

export function formatVatRate(bp: number): string {
  return `${bp / 100}%`;
}

/** Compute BTW breakdown: { vat_rate_bp -> vat_cents } */
export function vatBreakdown(lines: QuoteLineResponse[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const l of lines) {
    result.set(l.vat_rate_bp, (result.get(l.vat_rate_bp) ?? 0) + l.line_vat_cents);
  }
  return result;
}

/** Calculate live totals from form line items. */
export function calcLineTotals(
  quantity: number,
  unitPriceCents: number,
  vatRateBp: number
): { net: number; vat: number } {
  const net = Math.round(quantity * unitPriceCents);
  const vat = Math.round((net * vatRateBp) / 10000);
  return { net, vat };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listQuotes(
  page = 1,
  perPage = 20,
  statusFilter?: QuoteStatus
): Promise<QuoteListResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (statusFilter) params.set("status", statusFilter);
  return apiFetch<QuoteListResponse>(`/quotes/?${params.toString()}`);
}

export async function getQuote(id: string): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}`);
}

export async function createQuote(data: QuoteCreate): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>("/quotes/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateQuote(id: string, data: QuoteUpdate): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteQuote(id: string): Promise<void> {
  return apiFetch<void>(`/quotes/${id}`, { method: "DELETE" });
}

export async function transitionQuoteStatus(
  id: string,
  newStatus: QuoteStatus
): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: newStatus }),
  });
}

export async function convertQuoteToProject(id: string): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}/convert`, { method: "POST" });
}
