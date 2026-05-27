/**
 * Tests for Phase 19: Dashboard analytics — key metrics cards
 * Covers: DashboardAnalyticsCards component + fetchDashboardAnalytics API utility
 *
 * Cards:
 * - Active Projects (count of active status projects)
 * - Overdue Tasks (count of tasks past due date)
 * - Monthly Revenue (sum of paid invoices this month, Dutch locale €)
 * - Staff Utilization Rate (assigned hours / available hours, %)
 *
 * Each card shows: icon, label, value, trend indicator (up/down/neutral)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseDashboardResponse = {
  active_projects: 0,
  overdue_tasks: 0,
  monthly_revenue_cents: 0,
  staff_utilization_pct: 0,
  active_projects_trend: "neutral" as const,
  overdue_tasks_trend: "neutral" as const,
  monthly_revenue_trend: "neutral" as const,
  staff_utilization_trend: "neutral" as const,
};

// ---------------------------------------------------------------------------
// DashboardAnalyticsCards component
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — rendering", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders all four metric card testids", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    const data = {
      ...baseDashboardResponse,
      active_projects: 3,
      overdue_tasks: 1,
      monthly_revenue_cents: 150000,
      staff_utilization_pct: 75,
    };

    render(<DashboardAnalyticsCards data={data} loading={false} error={null} />);

    expect(screen.getByTestId("kpi-active-projects")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-overdue-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-monthly-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-staff-utilization")).toBeInTheDocument();
  });

  it("shows loading skeletons when loading=true", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(<DashboardAnalyticsCards data={null} loading={true} error={null} />);

    expect(screen.getByTestId("analytics-cards-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-active-projects")).not.toBeInTheDocument();
  });

  it("shows error message when error is set", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={null}
        loading={false}
        error="Verbinding mislukt"
      />
    );

    expect(screen.getByTestId("analytics-cards-error")).toBeInTheDocument();
    expect(screen.getByTestId("analytics-cards-error")).toHaveTextContent(
      "Verbinding mislukt"
    );
  });

  it("renders nothing when data is null and not loading/error", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    const { container } = render(
      <DashboardAnalyticsCards data={null} loading={false} error={null} />
    );

    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Active Projects card
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — Active Projects", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("displays active project count", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, active_projects: 7 }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("7");
  });

  it("renders label 'Actieve Projecten'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={baseDashboardResponse}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText(/actieve projecten/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Overdue Tasks card
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — Overdue Tasks", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("displays overdue task count", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, overdue_tasks: 4 }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("4");
  });

  it("renders label 'Verlopen Taken'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={baseDashboardResponse}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText(/verlopen taken/i)).toBeInTheDocument();
  });

  it("applies destructive color when overdue tasks > 0", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, overdue_tasks: 3 }}
        loading={false}
        error={null}
      />
    );

    const el = screen.getByTestId("kpi-overdue-tasks");
    expect(el).toHaveAttribute("style");
  });

  it("does not apply destructive color when overdue tasks = 0", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, overdue_tasks: 0 }}
        loading={false}
        error={null}
      />
    );

    const el = screen.getByTestId("kpi-overdue-tasks");
    expect(el).not.toHaveAttribute("style");
  });
});

// ---------------------------------------------------------------------------
// Monthly Revenue card (Dutch locale)
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — Monthly Revenue", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("formats revenue in Dutch locale (dot thousands, comma decimal)", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    // 123456 cents = €1.234,56
    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, monthly_revenue_cents: 123456 }}
        loading={false}
        error={null}
      />
    );

    const el = screen.getByTestId("kpi-monthly-revenue");
    expect(el.textContent).toMatch(/1\.234/);
    expect(el.textContent).toMatch(/,56/);
    expect(el.textContent).toMatch(/€/);
  });

  it("formats 0 cents as €0,00", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, monthly_revenue_cents: 0 }}
        loading={false}
        error={null}
      />
    );

    const el = screen.getByTestId("kpi-monthly-revenue");
    expect(el.textContent).toMatch(/€/);
    expect(el.textContent).toMatch(/0/);
  });

  it("renders label 'Maandelijkse Omzet'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={baseDashboardResponse}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText(/maandelijkse omzet/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Staff Utilization Rate card
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — Staff Utilization Rate", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("displays staff utilization as percentage", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, staff_utilization_pct: 82 }}
        loading={false}
        error={null}
      />
    );

    const el = screen.getByTestId("kpi-staff-utilization");
    expect(el.textContent).toContain("82");
    expect(el.textContent).toContain("%");
  });

  it("renders label 'Personeel Bezettingsgraad'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={baseDashboardResponse}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText(/personeel bezettingsgraad/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Trend indicators
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — trend indicators", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders trend-up testid for active_projects_trend='up'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, active_projects_trend: "up" }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("trend-active-projects")).toBeInTheDocument();
    expect(screen.getByTestId("trend-active-projects")).toHaveAttribute(
      "data-trend",
      "up"
    );
  });

  it("renders trend-down testid for overdue_tasks_trend='down'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, overdue_tasks_trend: "down" }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("trend-overdue-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("trend-overdue-tasks")).toHaveAttribute(
      "data-trend",
      "down"
    );
  });

  it("renders trend-neutral testid for monthly_revenue_trend='neutral'", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{ ...baseDashboardResponse, monthly_revenue_trend: "neutral" }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("trend-monthly-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("trend-monthly-revenue")).toHaveAttribute(
      "data-trend",
      "neutral"
    );
  });

  it("renders all four trend indicators", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    render(
      <DashboardAnalyticsCards
        data={{
          ...baseDashboardResponse,
          active_projects_trend: "up",
          overdue_tasks_trend: "down",
          monthly_revenue_trend: "up",
          staff_utilization_trend: "neutral",
        }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId("trend-active-projects")).toBeInTheDocument();
    expect(screen.getByTestId("trend-overdue-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("trend-monthly-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("trend-staff-utilization")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Grid layout
// ---------------------------------------------------------------------------

describe("DashboardAnalyticsCards — layout", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders responsive 4-column grid", async () => {
    const { DashboardAnalyticsCards } = await import(
      "@/components/dashboard/analytics-cards"
    );

    const { container } = render(
      <DashboardAnalyticsCards
        data={baseDashboardResponse}
        loading={false}
        error={null}
      />
    );

    const grid = container.querySelector(".grid");
    expect(grid?.className).toMatch(/sm:grid-cols-2/);
    expect(grid?.className).toMatch(/lg:grid-cols-4/);
  });
});

// ---------------------------------------------------------------------------
// fetchDashboardAnalytics API utility
// ---------------------------------------------------------------------------

describe("fetchDashboardAnalytics", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("calls apiFetch with /analytics/dashboard", async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(baseDashboardResponse);
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch }));
    vi.doMock("@/lib/auth", () => ({ getAccessToken: vi.fn(() => null) }));

    const { fetchDashboardAnalytics } = await import("@/lib/analytics");
    await fetchDashboardAnalytics();

    expect(mockApiFetch).toHaveBeenCalledOnce();
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toContain("/analytics/dashboard");
  });

  it("returns the response shape with trend fields", async () => {
    const mockResponse = {
      ...baseDashboardResponse,
      active_projects: 5,
      active_projects_trend: "up",
    };
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockResponse),
    }));
    vi.doMock("@/lib/auth", () => ({ getAccessToken: vi.fn(() => null) }));

    const { fetchDashboardAnalytics } = await import("@/lib/analytics");
    const result = await fetchDashboardAnalytics();

    expect(result.active_projects).toBe(5);
    expect(result.active_projects_trend).toBe("up");
  });

  it("propagates errors from apiFetch", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("API down")),
    }));
    vi.doMock("@/lib/auth", () => ({ getAccessToken: vi.fn(() => null) }));

    const { fetchDashboardAnalytics } = await import("@/lib/analytics");
    await expect(fetchDashboardAnalytics()).rejects.toThrow("API down");
  });
});

// ---------------------------------------------------------------------------
// Dashboard page integration — analytics cards wired up
// ---------------------------------------------------------------------------

describe("Dashboard page — analytics cards integration", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders analytics cards on the dashboard page after load", async () => {
    const mockResponse = {
      ...baseDashboardResponse,
      active_projects: 2,
      overdue_tasks: 1,
      monthly_revenue_cents: 50000,
      staff_utilization_pct: 60,
    };

    vi.doMock("@/lib/analytics", () => ({
      fetchDashboardAnalytics: vi.fn().mockResolvedValue(mockResponse),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/analytics-page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("2");
    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-staff-utilization")).toBeInTheDocument();
  });

  it("shows loading state initially on analytics page", async () => {
    vi.doMock("@/lib/analytics", () => ({
      fetchDashboardAnalytics: vi.fn().mockImplementation(
        () => new Promise(() => {}) // never resolves
      ),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/analytics-page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("analytics-cards-loading")).toBeInTheDocument();
  });

  it("shows error state when analytics fetch fails", async () => {
    vi.doMock("@/lib/analytics", () => ({
      fetchDashboardAnalytics: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/analytics-page");
    await act(async () => {
      render(<DashboardPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("analytics-cards-error")).toBeInTheDocument();
    });
  });
});
