/**
 * Invoice administration helpers.
 *
 * - computeTotalsBar  – openstaand / achterstallig / betaald (deze maand)
 * - getStatusPillClasses – consistent Tailwind classes per status
 * - getAgingInfo – days outstanding / overdue with amber/red tier
 */
import type { InvoiceResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Totals bar
// ---------------------------------------------------------------------------

export interface TotalsBar {
  /** Sum of all sent invoices (not yet overdue) */
  openstaand: number;
  /** Sum of all overdue invoices */
  achterstallig: number;
  /** Sum of all invoices paid in the current calendar month */
  betaaldDezeMaand: number;
}

export function computeTotalsBar(
  invoices: InvoiceResponse[],
  now: Date = new Date()
): TotalsBar {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  let openstaand = 0;
  let achterstallig = 0;
  let betaaldDezeMaand = 0;

  for (const inv of invoices) {
    switch (inv.status) {
      case "sent":
        openstaand += inv.total_cents;
        break;
      case "overdue":
        achterstallig += inv.total_cents;
        break;
      case "paid": {
        if (inv.paid_at) {
          const paidDate = new Date(inv.paid_at);
          if (
            paidDate.getFullYear() === currentYear &&
            paidDate.getMonth() === currentMonth
          ) {
            betaaldDezeMaand += inv.total_cents;
          }
        }
        break;
      }
      default:
        // draft and any future statuses are excluded from all totals
        break;
    }
  }

  return { openstaand, achterstallig, betaaldDezeMaand };
}

// ---------------------------------------------------------------------------
// Status pill classes
// ---------------------------------------------------------------------------

/** Consistent Tailwind class string for status badge/pill. */
export function getStatusPillClasses(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    case "sent":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "paid":
      return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    case "overdue":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

// ---------------------------------------------------------------------------
// Aging info
// ---------------------------------------------------------------------------

export type AgingTier = "none" | "amber" | "red";

export interface AgingInfo {
  /** Number of calendar days the invoice is past its due date (0 if not yet due). */
  daysOverdue: number;
  /** Number of calendar days until due date (positive = not yet due). */
  daysUntilDue: number;
  /** Visual highlight tier: none = on time, amber = 1-14 dagen te laat, red = >14 dagen te laat */
  tier: AgingTier;
}

/**
 * Returns null for statuses where aging is irrelevant (paid, draft).
 * Returns AgingInfo for sent and overdue invoices.
 */
export function getAgingInfo(
  invoice: InvoiceResponse,
  now: Date = new Date()
): AgingInfo | null {
  if (invoice.status === "paid" || invoice.status === "draft") {
    return null;
  }

  // Strip time component: compare calendar days only
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const dueParts = invoice.due_date.split("T")[0].split("-");
  const dueDate = new Date(
    parseInt(dueParts[0]),
    parseInt(dueParts[1]) - 1,
    parseInt(dueParts[2])
  );

  const diffMs = today.getTime() - dueDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const daysOverdue = Math.max(0, diffDays);
  const daysUntilDue = Math.max(0, -diffDays);

  let tier: AgingTier = "none";
  if (daysOverdue > 14) {
    tier = "red";
  } else if (daysOverdue >= 1) {
    tier = "amber";
  }

  return { daysOverdue, daysUntilDue, tier };
}
