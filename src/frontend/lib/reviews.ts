import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewResponse {
  id: string;
  location_id: string;
  external_id: string;
  author_name: string;
  rating: number; // 1-5
  comment: string | null;
  created_at_external: string | null;
  reply_text: string | null;
  replied_at: string | null;
}

export interface ReviewStats {
  average_rating: number;
  total_count: number;
  rating_distribution: Record<string, number>; // {"1": 0, "2": 1, ...}
  monthly_trend: Array<{ month: string; average_rating: number; count: number }>;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function fetchReviews(locationId: string): Promise<ReviewResponse[]> {
  const res = await apiFetch<{ data: ReviewResponse[] }>(
    `/reviews?location_id=${locationId}`
  );
  return res.data;
}

export async function fetchReviewStats(locationId: string): Promise<ReviewStats> {
  const res = await apiFetch<{ data: ReviewStats }>(
    `/reviews/stats?location_id=${locationId}`
  );
  return res.data;
}

export async function syncReviews(
  locationId: string
): Promise<{ location_id: string; synced_count: number }> {
  const res = await apiFetch<{ data: { location_id: string; synced_count: number } }>(
    `/reviews/sync`,
    { method: "POST", body: JSON.stringify({ location_id: locationId }) }
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatReviewDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return isoDate;
  }
}

export function renderStars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}
