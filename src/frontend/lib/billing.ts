import { apiFetch } from "@/lib/api";

export type Tier = "free" | "starter" | "pro";

export interface Subscription {
  id: string;
  tier: Tier;
  status: string;
  project_limit: number | null;
  current_period_end: string;
  trial_ends_at: string | null;
}

export interface Usage {
  project_count: number;
  user_count: number;
  storage_bytes: number;
}

export interface CheckoutResponse {
  checkout_url: string;
}

export function getSubscription(): Promise<Subscription> {
  return apiFetch<Subscription>("/billing/subscription");
}

export function getUsage(): Promise<Usage> {
  return apiFetch<Usage>("/billing/usage");
}

export function createCheckout(tier: Exclude<Tier, "free">): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}
