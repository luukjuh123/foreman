import { apiFetch } from "@/lib/api";

export interface NotificationResponse {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channels_dispatched: string[];
  read_at: string | null;
  created_at: string;
}

export interface NotificationsListResponse {
  data: NotificationResponse[];
  unread_count: number;
  error: string | null;
}

export async function fetchNotifications(params: {
  unread_only?: boolean;
  page?: number;
  per_page?: number;
} = {}): Promise<NotificationsListResponse> {
  const { unread_only = false, page = 1, per_page = 50 } = params;
  const qs = new URLSearchParams({
    unread_only: String(unread_only),
    page: String(page),
    per_page: String(per_page),
  });
  return apiFetch<NotificationsListResponse>(`/notifications/?${qs}`);
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch<unknown>(`/notifications/${id}/read`, { method: "POST" });
}
