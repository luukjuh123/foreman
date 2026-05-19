import { apiFetch } from "./api";

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

export interface AccountSection {
  accounts: AccountNode[];
  total_cents: number;
}

export interface BalanceSheetResponse {
  as_of: string;
  assets: AccountSection;
  liabilities: AccountSection;
  equity: AccountSection;
  retained_earnings_cents: number;
  total_liabilities_and_equity_cents: number;
  is_balanced: boolean;
}

export interface IncomeStatementResponse {
  start_date: string;
  end_date: string;
  revenue: AccountSection;
  expenses: AccountSection;
  net_income_cents: number;
}

export interface CashFlowResponse {
  start_date: string;
  end_date: string;
  operating: AccountSection;
  investing: AccountSection;
  financing: AccountSection;
  net_change_cents: number;
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
// API functions
// ---------------------------------------------------------------------------

export async function fetchBalanceSheet(asOf: string): Promise<BalanceSheetResponse> {
  return apiFetch<BalanceSheetResponse>(
    `/financials/reports/balance-sheet?as_of=${encodeURIComponent(asOf)}`
  );
}

export async function fetchIncomeStatement(
  startDate: string,
  endDate: string
): Promise<IncomeStatementResponse> {
  return apiFetch<IncomeStatementResponse>(
    `/financials/reports/income-statement?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
  );
}

export async function fetchCashFlow(
  startDate: string,
  endDate: string
): Promise<CashFlowResponse> {
  return apiFetch<CashFlowResponse>(
    `/financials/reports/cash-flow?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
  );
}
