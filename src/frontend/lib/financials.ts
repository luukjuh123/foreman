import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountNode {
  account_id: string;
  code: string;
  name: string;
  balance_cents: number;
  children: AccountNode[];
}

export interface SectionData {
  accounts: AccountNode[];
  total_cents: number;
}

export interface IncomeStatementResponse {
  start_date: string;
  end_date: string;
  revenue: SectionData;
  expenses: SectionData;
  net_income_cents: number;
  is_profit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function fetchIncomeStatement(
  startDate: string,
  endDate: string
): Promise<IncomeStatementResponse> {
  return apiFetch<IncomeStatementResponse>(
    `/financials/reports/income-statement?start_date=${startDate}&end_date=${endDate}`
  );
}
