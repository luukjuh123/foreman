import { apiFetch } from "./api";
import { getAccessToken } from "./auth";
import type {
  StaffListResponse,
  StaffOutstandingBalance,
  StaffLoanResponse,
  StaffLoanCreate,
  LoanDeductionResponse,
  LoanDeductionCreate,
} from "./types";

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function token(): string | undefined {
  return getAccessToken() ?? undefined;
}

export async function listStaff(page = 1, perPage = 100): Promise<StaffListResponse> {
  return apiFetch<StaffListResponse>(
    `/staff/?page=${page}&per_page=${perPage}`,
    { token: token() }
  );
}

export async function getStaffLoanBalance(staffId: string): Promise<StaffOutstandingBalance> {
  return apiFetch<StaffOutstandingBalance>(`/loans/staff/${staffId}/balance`, {
    token: token(),
  });
}

export async function issueLoan(data: StaffLoanCreate): Promise<StaffLoanResponse> {
  return apiFetch<StaffLoanResponse>("/loans/", {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}

export async function recordDeduction(
  loanId: string,
  data: LoanDeductionCreate
): Promise<LoanDeductionResponse> {
  return apiFetch<LoanDeductionResponse>(`/loans/${loanId}/deductions`, {
    method: "POST",
    body: JSON.stringify(data),
    token: token(),
  });
}
