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

export interface IncomeStatementResponse {
  start_date: string;
  end_date: string;
  revenue: { accounts: AccountNode[]; total_cents: number };
  expenses: { accounts: AccountNode[]; total_cents: number };
  net_income_cents: number;
  is_profit: boolean;
}

export interface BalanceSheetResponse {
  as_of: string;
  assets: { accounts: AccountNode[]; total_cents: number };
  liabilities: { accounts: AccountNode[]; total_cents: number };
  equity: { accounts: AccountNode[]; total_cents: number };
  retained_earnings_cents: number;
  total_liabilities_and_equity_cents: number;
  is_balanced: boolean;
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

export async function fetchBalanceSheet(
  asOf: string
): Promise<BalanceSheetResponse> {
  return apiFetch<BalanceSheetResponse>(
    `/financials/reports/balance-sheet?as_of=${asOf}`
  );
}
