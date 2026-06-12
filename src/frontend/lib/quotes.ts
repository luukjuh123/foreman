import { apiFetch } from "@/lib/api";
import type {
  QuoteResponse,
  QuoteListResponse,
  QuoteCreate,
  QuoteUpdate,
  QuoteAcceptResponse,
} from "@/lib/types";

type QuoteStatusFilter = "draft" | "sent" | "accepted" | "rejected" | "expired";

export function listQuotes(page: number, status?: QuoteStatusFilter): Promise<QuoteListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (status) params.set("status", status);
  return apiFetch<QuoteListResponse>(`/quotes?${params.toString()}`);
}

export function getQuote(id: string): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}`);
}

export function createQuote(payload: QuoteCreate): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>("/quotes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateQuote(id: string, payload: QuoteUpdate): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteQuote(id: string): Promise<null> {
  return apiFetch<null>(`/quotes/${id}`, { method: "DELETE" });
}

export function sendQuote(id: string): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}/send`, { method: "POST" });
}

export function acceptQuote(id: string): Promise<QuoteAcceptResponse> {
  return apiFetch<QuoteAcceptResponse>(`/quotes/${id}/accept`, { method: "POST" });
}

export function rejectQuote(id: string): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/quotes/${id}/reject`, { method: "POST" });
}
