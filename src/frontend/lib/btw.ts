/**
 * BTW (VAT) aangifte utilities.
 * All amounts in integer euro cents internally.
 */

export interface BtwAangifteResponse {
  id: string;
  year: number;
  quarter: number;
  status: "draft" | "submitted" | "accepted";
  box_1a_net_cents: number;
  box_1b_net_cents: number;
  box_1c_net_cents: number;
  box_1d_net_cents: number;
  box_5a_vat_due_cents: number;
  box_5b_voorbelasting_cents: number;
  box_5d_payable_cents: number;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Format euro cents to Dutch locale string: "€ 1.234,56"
 */
export function formatBtwCents(cents: number): string {
  const euros = cents / 100;
  return (
    "€ " +
    euros.toLocaleString("nl-NL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const QUARTER_LABELS: Record<number, string> = {
  1: "jan-mrt",
  2: "apr-jun",
  3: "jul-sep",
  4: "okt-dec",
};

/**
 * Format a quarter label in Dutch: "Q1 2024 (jan-mrt)"
 */
export function formatQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year} (${QUARTER_LABELS[quarter]})`;
}

/**
 * Return ISO date range strings for a quarter.
 */
export function getQuarterDateRange(
  year: number,
  quarter: number
): { start: string; end: string } {
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  const lastDay = new Date(year, lastMonth, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(firstMonth)}-01`,
    end: `${year}-${pad(lastMonth)}-${pad(lastDay)}`,
  };
}
