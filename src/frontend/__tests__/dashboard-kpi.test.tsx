/**
 * Tests for dashboard KPI widgets — now powered by GET /api/v1/dashboard/stats.
 * Stats computation is server-side; these tests verify correct rendering from
 * the stats response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const baseStats = {
  active_projects: 0,
  overdue_tasks: 0,
  monthly_revenue_cents: 0,
  outstanding_cents: 0,
  staff_utilization_pct: 0.0,
};

const fmtBudget = (c: number) => `€${(c / 100).toFixed(2)}`;

describe("Dashboard KPI — active projects count", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows active project count from stats endpoint", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...baseStats, active_projects: 2 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("2");
  });
});

describe("Dashboard KPI — overdue tasks", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders overdue task count from stats endpoint", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...baseStats, overdue_tasks: 2 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("2");
  });

  it("shows 0 when no overdue tasks", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...baseStats, overdue_tasks: 0 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("0");
  });
});

describe("Dashboard KPI — monthly revenue", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders monthly revenue from stats endpoint", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...baseStats, monthly_revenue_cents: 80000 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // 80000 cents = €800.00
    const kpi = screen.getByTestId("kpi-monthly-revenue");
    expect(kpi).toHaveTextContent("800");
  });

  it("shows €0 when no monthly revenue", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(baseStats),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-monthly-revenue")).toHaveTextContent("0");
  });
});

describe("Dashboard KPI — outstanding invoices", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders outstanding amount from stats endpoint", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...baseStats, outstanding_cents: 65000 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // 65000 cents = €650.00
    const kpi = screen.getByTestId("kpi-outstanding-invoices");
    expect(kpi).toHaveTextContent("650");
  });
});
