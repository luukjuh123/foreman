/**
 * Tests for the dashboard stats endpoint integration and staff utilization KPI card.
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

const mockStats = {
  active_projects: 3,
  overdue_tasks: 2,
  monthly_revenue_cents: 150000,
  outstanding_cents: 75000,
  staff_utilization_pct: 72.5,
};

describe("Dashboard — stats endpoint integration", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("fetches /dashboard/stats and renders all five KPI cards", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockStats),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByText(/actieve projecten/i)).toBeInTheDocument();
    expect(screen.getByText(/verlopen taken/i)).toBeInTheDocument();
    expect(screen.getByText(/maandelijkse omzet/i)).toBeInTheDocument();
    expect(screen.getByText(/openstaande facturen/i)).toBeInTheDocument();
    expect(screen.getByText(/personeelsbezetting/i)).toBeInTheDocument();
  });

  it("renders the staff utilization KPI card with correct percentage", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockStats),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    const kpi = screen.getByTestId("kpi-staff-utilization");
    expect(kpi).toHaveTextContent("72.5%");
  });

  it("renders correct values from stats endpoint", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockStats),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("3");
    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("2");
  });

  it("shows loading skeleton with 5 placeholder cards", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });

  it("shows error state when stats endpoint fails", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("network error")),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
  });

  it("shows 0.0% utilization when stats returns 0", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({
        ...mockStats,
        staff_utilization_pct: 0,
      }),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-staff-utilization")).toHaveTextContent("0.0%");
  });
});
