/**
 * Tests for invoice administration helper functions:
 * - computeTotalsBar: summarise openstaand / achterstallig / betaald (deze maand)
 * - getStatusPillClasses: consistent status → Tailwind class mapping
 * - getAgingInfo: days outstanding + highlight tier
 */
import { describe, it, expect } from "vitest";
import {
  computeTotalsBar,
  getStatusPillClasses,
  getAgingInfo,
} from "@/lib/invoice-admin-helpers";
import type { InvoiceResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInvoice(overrides: Partial<InvoiceResponse> = {}): InvoiceResponse {
  return {
    id: "inv-1",
    customer_id: "cust-1",
    project_id: null,
    invoice_number: "2024-001",
    issue_date: "2024-01-15",
    due_date: "2024-02-15",
    payment_terms_days: 30,
    currency: "EUR",
    status: "draft",
    notes: null,
    subtotal_cents: 50000,
    vat_total_cents: 10500,
    total_cents: 60500,
    sent_at: null,
    paid_at: null,
    lines: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeTotalsBar
// ---------------------------------------------------------------------------

describe("computeTotalsBar", () => {
  it("returns zeros for empty list", () => {
    const result = computeTotalsBar([], new Date("2024-03-15"));
    expect(result).toEqual({ openstaand: 0, achterstallig: 0, betaaldDezeMaand: 0 });
  });

  it("counts sent invoices as openstaand", () => {
    const invoices = [
      makeInvoice({ status: "sent", total_cents: 10000 }),
      makeInvoice({ id: "inv-2", status: "sent", total_cents: 5000 }),
    ];
    const result = computeTotalsBar(invoices, new Date("2024-03-15"));
    expect(result.openstaand).toBe(15000);
  });

  it("counts overdue invoices as achterstallig (not openstaand)", () => {
    const invoices = [
      makeInvoice({ status: "overdue", total_cents: 20000 }),
    ];
    const result = computeTotalsBar(invoices, new Date("2024-03-15"));
    expect(result.achterstallig).toBe(20000);
    expect(result.openstaand).toBe(0);
  });

  it("counts paid invoices this calendar month as betaaldDezeMaand", () => {
    const now = new Date("2024-03-15");
    const invoices = [
      makeInvoice({ status: "paid", total_cents: 8000, paid_at: "2024-03-10T12:00:00Z" }),
      makeInvoice({ id: "inv-2", status: "paid", total_cents: 3000, paid_at: "2024-03-01T00:00:00Z" }),
    ];
    const result = computeTotalsBar(invoices, now);
    expect(result.betaaldDezeMaand).toBe(11000);
  });

  it("excludes paid invoices from a different month", () => {
    const now = new Date("2024-03-15");
    const invoices = [
      makeInvoice({ status: "paid", total_cents: 5000, paid_at: "2024-02-28T12:00:00Z" }),
    ];
    const result = computeTotalsBar(invoices, now);
    expect(result.betaaldDezeMaand).toBe(0);
  });

  it("ignores draft invoices in all totals", () => {
    const invoices = [
      makeInvoice({ status: "draft", total_cents: 99999 }),
    ];
    const result = computeTotalsBar(invoices, new Date("2024-03-15"));
    expect(result).toEqual({ openstaand: 0, achterstallig: 0, betaaldDezeMaand: 0 });
  });

  it("handles mixed statuses correctly", () => {
    const now = new Date("2024-03-15");
    const invoices = [
      makeInvoice({ id: "1", status: "sent", total_cents: 10000 }),
      makeInvoice({ id: "2", status: "overdue", total_cents: 5000 }),
      makeInvoice({ id: "3", status: "paid", total_cents: 7000, paid_at: "2024-03-05T00:00:00Z" }),
      makeInvoice({ id: "4", status: "paid", total_cents: 2000, paid_at: "2024-02-10T00:00:00Z" }),
      makeInvoice({ id: "5", status: "draft", total_cents: 3000 }),
    ];
    const result = computeTotalsBar(invoices, now);
    expect(result.openstaand).toBe(10000);
    expect(result.achterstallig).toBe(5000);
    expect(result.betaaldDezeMaand).toBe(7000);
  });
});

// ---------------------------------------------------------------------------
// getStatusPillClasses
// ---------------------------------------------------------------------------

describe("getStatusPillClasses", () => {
  it("returns gray classes for draft (concept)", () => {
    const classes = getStatusPillClasses("draft");
    expect(classes).toContain("gray");
  });

  it("returns blue classes for sent (verzonden)", () => {
    const classes = getStatusPillClasses("sent");
    expect(classes).toContain("blue");
  });

  it("returns green classes for paid (betaald)", () => {
    const classes = getStatusPillClasses("paid");
    expect(classes).toContain("green");
  });

  it("returns red classes for overdue (achterstallig)", () => {
    const classes = getStatusPillClasses("overdue");
    expect(classes).toContain("red");
  });

  it("returns a fallback for unknown status", () => {
    const classes = getStatusPillClasses("unknown");
    expect(typeof classes).toBe("string");
    expect(classes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getAgingInfo
// ---------------------------------------------------------------------------

describe("getAgingInfo", () => {
  it("returns null for paid invoices", () => {
    const inv = makeInvoice({ status: "paid", due_date: "2024-01-01" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result).toBeNull();
  });

  it("returns null for draft invoices", () => {
    const inv = makeInvoice({ status: "draft", due_date: "2024-01-01" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result).toBeNull();
  });

  it("returns daysOverdue=0 and tier=none for a sent invoice not yet due", () => {
    const inv = makeInvoice({ status: "sent", due_date: "2024-04-01" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result).not.toBeNull();
    expect(result!.daysOverdue).toBe(0);
    expect(result!.tier).toBe("none");
  });

  it("returns daysOverdue=0 and tier=none for a sent invoice due today", () => {
    const inv = makeInvoice({ status: "sent", due_date: "2024-03-15" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result!.daysOverdue).toBe(0);
    expect(result!.tier).toBe("none");
  });

  it("returns amber tier for 1-14 days overdue", () => {
    // due 10 days ago
    const inv = makeInvoice({ status: "sent", due_date: "2024-03-05" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result!.daysOverdue).toBe(10);
    expect(result!.tier).toBe("amber");
  });

  it("returns amber tier at exactly 14 days overdue", () => {
    const inv = makeInvoice({ status: "sent", due_date: "2024-03-01" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result!.daysOverdue).toBe(14);
    expect(result!.tier).toBe("amber");
  });

  it("returns red tier for >14 days overdue (overdue status)", () => {
    const inv = makeInvoice({ status: "overdue", due_date: "2024-02-15" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result!.daysOverdue).toBe(29);
    expect(result!.tier).toBe("red");
  });

  it("returns red tier for sent invoice >14 days overdue", () => {
    // sent but 20 days past due
    const inv = makeInvoice({ status: "sent", due_date: "2024-02-24" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result!.daysOverdue).toBe(20);
    expect(result!.tier).toBe("red");
  });

  it("returns daysOutstanding (positive) for invoice not yet overdue", () => {
    const inv = makeInvoice({ status: "sent", due_date: "2024-04-01" });
    const result = getAgingInfo(inv, new Date("2024-03-15"));
    expect(result!.daysUntilDue).toBeGreaterThan(0);
  });
});
