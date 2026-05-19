import { apiFetch } from "./api";

export interface AccountNode {
  account_id: string;
  code: string;
  name: string;
  balance_cents: number;
  children: AccountNode[];
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

export interface IncomeStatementResponse {
  start_date: string;
  end_date: string;
  revenue: { accounts: AccountNode[]; total_cents: number };
  expenses: { accounts: AccountNode[]; total_cents: number };
  net_income_cents: number;
  is_profit: boolean;
}

export interface CashFlowLine {
  account_id: string;
  code: string;
  name: string;
  change_cents: number;
}

export interface CashFlowResponse {
  start_date: string;
  end_date: string;
  net_income_cents: number;
  operating_activities: { lines: CashFlowLine[]; total_cents: number };
  investing_activities: { lines: CashFlowLine[]; total_cents: number };
  financing_activities: { lines: CashFlowLine[]; total_cents: number };
  opening_cash_cents: number;
  ending_cash_cents: number;
  net_change_in_cash_cents: number;
  reconciles: boolean;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

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
