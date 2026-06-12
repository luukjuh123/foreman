import { apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type { CustomerResponse, CustomerCreate, CustomerUpdate } from "./types";

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export async function listCustomers(): Promise<CustomerResponse[]> {
  return apiFetch<CustomerResponse[]>("/customers/", { token: token() });
}

export async function getCustomer(id: string): Promise<CustomerResponse> {
  return apiFetch<CustomerResponse>(`/customers/${id}`, { token: token() });
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
