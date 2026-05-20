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
  net_change_in_cash_cents: number;
  ending_cash_cents: number;
  reconciles: boolean;
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

export function flattenAccountsToCSV(
  accounts: AccountNode[],
  section: string,
  depth: number = 0
): string[][] {
  const rows: string[][] = [];
  const indent = "  ".repeat(depth);
  for (const account of accounts) {
    rows.push([
      `${indent}${account.code}`,
      account.name,
      section,
      formatCents(account.balance_cents),
    ]);
    if (account.children.length > 0) {
      rows.push(...flattenAccountsToCSV(account.children, section, depth + 1));
    }
  }
  return rows;
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

export async function fetchCashFlow(
  startDate: string,
  endDate: string
): Promise<CashFlowResponse> {
  return apiFetch<CashFlowResponse>(
    `/financials/reports/cash-flow?start_date=${startDate}&end_date=${endDate}`
  );
}
