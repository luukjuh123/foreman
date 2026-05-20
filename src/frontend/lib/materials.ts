import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaterialResult {
  store: string;
  product_id: string;
  name: string;
  url: string;
  price_cents: number;
  in_stock: boolean;
  unit: string;
}

export interface SearchResponse {
  data: MaterialResult[];
  error: string | null;
}

export interface StoresResponse {
  data: string[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatPriceCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function searchMaterials(
  query: string,
  maxResults = 20
): Promise<SearchResponse> {
  const params = new URLSearchParams({ query, max_results: String(maxResults) });
  return apiFetch<SearchResponse>(`/materials/search?${params}`);
}

export async function fetchStores(): Promise<StoresResponse> {
  return apiFetch<StoresResponse>("/materials/stores");
}
