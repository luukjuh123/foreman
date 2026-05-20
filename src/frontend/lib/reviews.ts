import { apiFetch } from "@/lib/api";

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
