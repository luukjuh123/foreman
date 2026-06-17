import { describe, it, expect } from "vitest";
import { formatMoney, formatDate } from "@/lib/format";

describe("formatMoney", () => {
  it("formats integer cents to Dutch currency", () => {
    // nl-NL uses comma decimal and period thousands
    expect(formatMoney(123456)).toMatch(/1\.234/);
    expect(formatMoney(123456)).toMatch(/56/);
    expect(formatMoney(123456)).toContain("€");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toContain("€");
    expect(formatMoney(0)).toContain("0");
  });

  it("formats small amount", () => {
    const result = formatMoney(100);
    expect(result).toContain("1");
    expect(result).toContain("€");
  });
});

describe("formatDate", () => {
  it("formats ISO date to dd-MM-yyyy", () => {
    expect(formatDate("2024-03-15")).toBe("15-03-2024");
  });

  it("handles ISO datetime string", () => {
    expect(formatDate("2024-12-01T10:30:00Z")).toBe("01-12-2024");
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });
});
