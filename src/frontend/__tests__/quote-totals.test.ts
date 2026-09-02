import { describe, it, expect } from "vitest";
import { calcLineTotals, vatBreakdown, formatMoney, formatDate, formatVatRate } from "@/lib/quotes";
import type { QuoteLineResponse } from "@/lib/quotes";

// ---------------------------------------------------------------------------
// calcLineTotals
// ---------------------------------------------------------------------------

describe("calcLineTotals", () => {
  it("computes 21% VAT correctly", () => {
    const { net, vat } = calcLineTotals(2, 50000, 2100);
    expect(net).toBe(100000); // 2 * 50000
    expect(vat).toBe(21000);  // 100000 * 0.21
  });

  it("computes 9% VAT correctly", () => {
    const { net, vat } = calcLineTotals(1, 10000, 900);
    expect(net).toBe(10000);
    expect(vat).toBe(900);
  });

  it("computes 0% VAT correctly", () => {
    const { net, vat } = calcLineTotals(3, 1000, 0);
    expect(net).toBe(3000);
    expect(vat).toBe(0);
  });

  it("rounds to nearest cent", () => {
    // 1.5 * 333 = 499.5 cents -> rounds to 500
    const { net } = calcLineTotals(1.5, 333, 0);
    expect(net).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// vatBreakdown
// ---------------------------------------------------------------------------

describe("vatBreakdown", () => {
  function makeLine(id: string, vatRateBp: number, lineVatCents: number): QuoteLineResponse {
    return {
      id,
      position: 0,
      description: "Test",
      quantity: 1,
      unit: "stuks",
      unit_price_cents: 10000,
      vat_rate_bp: vatRateBp,
      line_net_cents: 10000,
      line_vat_cents: lineVatCents,
    };
  }

  it("groups VAT by rate", () => {
    const lines = [
      makeLine("l-1", 2100, 2100),
      makeLine("l-2", 2100, 4200),
      makeLine("l-3", 900, 900),
    ];
    const result = vatBreakdown(lines);
    expect(result.get(2100)).toBe(6300);
    expect(result.get(900)).toBe(900);
  });

  it("returns empty map for empty lines", () => {
    expect(vatBreakdown([])).toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------

describe("formatMoney", () => {
  it("formats cents as Dutch euro", () => {
    // 60500 cents = €605,00
    expect(formatMoney(60500)).toMatch(/605,00/);
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toMatch(/0,00/);
  });

  it("formats large amounts with thousands separator", () => {
    // 1234500 cents = €12.345,00
    expect(formatMoney(1234500)).toMatch(/12\.345,00/);
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("formats ISO date as dd-MM-yyyy", () => {
    expect(formatDate("2026-06-12")).toBe("12-06-2026");
  });

  it("handles ISO datetime strings", () => {
    expect(formatDate("2026-06-12T10:00:00Z")).toBe("12-06-2026");
  });

  it("returns em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatVatRate
// ---------------------------------------------------------------------------

describe("formatVatRate", () => {
  it("converts basis points to percentage string", () => {
    expect(formatVatRate(2100)).toBe("21%");
    expect(formatVatRate(900)).toBe("9%");
    expect(formatVatRate(0)).toBe("0%");
  });
});
