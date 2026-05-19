import { apiFetch } from "./api";

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
// Balance sheet types (used by balance-sheet page)
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

// ---------------------------------------------------------------------------
// Cash flow types
// ---------------------------------------------------------------------------

export interface CashFlowLine {
  account_id: string;
  code: string;
  name: string;
  change_cents: number;
}

export interface CashFlowSection {
  lines: CashFlowLine[];
  total_cents: number;
}

export interface CashFlowResponse {
  start_date: string;
  end_date: string;
  net_income_cents: number;
  operating_activities: CashFlowSection;
  investing_activities: CashFlowSection;
  financing_activities: CashFlowSection;
  opening_cash_cents: number;
  ending_cash_cents: number;
  net_change_in_cash_cents: number;
  reconciles: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchCashFlow(
  startDate: string,
  endDate: string
): Promise<CashFlowResponse> {
  return apiFetch<CashFlowResponse>(
    `/financials/reports/cash-flow?start_date=${startDate}&end_date=${endDate}`
  );
}

export async function fetchIncomeStatement(
  startDate: string,
  endDate: string
): Promise<IncomeStatementResponse> {
  return apiFetch<IncomeStatementResponse>(
    `/financials/reports/income-statement?start_date=${startDate}&end_date=${endDate}`
  );
}
