import { apiFetch } from "@/lib/api";

export function formatReviewDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export interface ReviewResponse {
  id: string;
  location_id: string;
  external_id: string;
  author_name: string;
  rating: number;
  comment: string | null;
  created_at_external: string | null;
  reply_text: string | null;
  replied_at: string | null;
}

export async function fetchDraftReply(reviewId: string): Promise<{ draft_text: string }> {
  const res = await apiFetch<{ data: { draft_text: string } }>(
    `/reviews/${reviewId}/draft-reply`,
    { method: "POST" }
  );
  return res.data;
}

export async function submitReply(
  reviewId: string,
  text: string
): Promise<ReviewResponse> {
  const res = await apiFetch<{ data: ReviewResponse }>(`/reviews/${reviewId}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return res.data;
}
