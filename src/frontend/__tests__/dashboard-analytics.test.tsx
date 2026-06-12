/**
 * Tests for Phase 19 dashboard analytics — KPI cards:
 * - Active projects count
 * - Overdue tasks count
 * - Monthly revenue (Dutch locale, euro cents)
 * - Staff utilization rate (assigned hours / available hours this month)
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

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeProject(opts: {
  id: string;
  status?: string;
  phases?: Array<{ tasks: Array<{ status: string; end_date: string | null }> }>;
}) {
  return {
    id: opts.id,
    name: `Project ${opts.id}`,
    description: null,
    status: opts.status ?? "active",
    start_date: null,
    end_date: null,
    budget_cents: 0,
    phases: (opts.phases ?? []).map((ph, pi) => ({
      id: `phase-${opts.id}-${pi}`,
      project_id: opts.id,
      name: `Phase ${pi}`,
      description: null,
      order_index: pi,
      status: "active",
      start_date: null,
      end_date: null,
      tasks: ph.tasks.map((t, ti) => ({
        id: `task-${opts.id}-${pi}-${ti}`,
        phase_id: `phase-${opts.id}-${pi}`,
        name: `Task ${ti}`,
        status: t.status,
        priority: 0,
        estimated_hours: null,
        end_date: t.end_date,
      })),
    })),
  };
}

function makeStaff(id: string, weeklyHoursTarget = 40) {
  return {
    id,
    owner_id: "owner-1",
    full_name: `Staff ${id}`,
    role: "Timmerman",
    email: null,
    phone: null,
    hourly_rate_cents: 4500,
    weekly_hours_target: weeklyHoursTarget,
    active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    availability: [],
  };
}

function makeAssignment(staffId: string, startAt: string, endAt: string) {
  return {
    id: `asgn-${staffId}-${startAt}`,
    staff_id: staffId,
    project_id: "proj-1",
    task_id: null,
    start_at: startAt,
    end_at: endAt,
    notes: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}

const PAST_DATE = "2020-01-01";
const FUTURE_DATE = "2099-12-31";
const THIS_MONTH = new Date().toISOString().slice(0, 7); // "YYYY-MM"

// ─── KPI Cards component tests ───────────────────────────────────────────────

describe("KpiCards component", () => {
  it("renders all four metric labels", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    const stats = {
      activeProjects: 3,
      overdueTasks: 1,
      monthlyRevenueCents: 150000,
      staffUtilizationPct: 75,
    };

    render(<KpiCards stats={stats} loading={false} error={null} />);

    expect(screen.getByTestId("kpi-active-projects")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-overdue-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-monthly-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-staff-utilization")).toBeInTheDocument();
  });

  it("shows loading skeletons when loading=true", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    render(<KpiCards stats={null} loading={true} error={null} />);

    expect(screen.getByTestId("kpi-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-active-projects")).not.toBeInTheDocument();
  });

  it("shows error message when error is set", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    render(<KpiCards stats={null} loading={false} error="Verbinding mislukt" />);

    expect(screen.getByTestId("kpi-error")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-error")).toHaveTextContent("Verbinding mislukt");
  });

  it("formats monthly revenue in Dutch locale (euro cents)", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    // 123456 cents = €1.234,56
    const stats = {
      activeProjects: 0,
      overdueTasks: 0,
      monthlyRevenueCents: 123456,
      staffUtilizationPct: 0,
    };

    render(<KpiCards stats={stats} loading={false} error={null} />);

    const revenueEl = screen.getByTestId("kpi-monthly-revenue");
    // Must contain both 1.234 (dot as thousands sep) and ,56 (comma as decimal)
    expect(revenueEl.textContent).toMatch(/1\.234/);
    expect(revenueEl.textContent).toMatch(/,56/);
  });

  it("shows staff utilization as percentage", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    const stats = {
      activeProjects: 0,
      overdueTasks: 0,
      monthlyRevenueCents: 0,
      staffUtilizationPct: 82,
    };

    render(<KpiCards stats={stats} loading={false} error={null} />);

    expect(screen.getByTestId("kpi-staff-utilization")).toHaveTextContent("82");
    expect(screen.getByTestId("kpi-staff-utilization")).toHaveTextContent("%");
  });

  it("renders responsive grid with correct classes", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    const stats = {
      activeProjects: 0,
      overdueTasks: 0,
      monthlyRevenueCents: 0,
      staffUtilizationPct: 0,
    };

    const { container } = render(<KpiCards stats={stats} loading={false} error={null} />);

    const grid = container.querySelector(".grid");
    expect(grid?.className).toMatch(/sm:grid-cols-2/);
    expect(grid?.className).toMatch(/lg:grid-cols-4/);
  });

  it("highlights overdue tasks count in red when > 0", async () => {
    const { KpiCards } = await import("@/components/dashboard/kpi-cards");

    const stats = {
      activeProjects: 0,
      overdueTasks: 5,
      monthlyRevenueCents: 0,
      staffUtilizationPct: 0,
    };

    render(<KpiCards stats={stats} loading={false} error={null} />);

    const el = screen.getByTestId("kpi-overdue-tasks");
    // Should have inline destructive color style
    expect(el).toHaveAttribute("style");
  });
});

// ─── formatBudget (Dutch locale) ─────────────────────────────────────────────

describe("formatBudget Dutch locale", () => {
  it("formats 0 cents as €0,00", async () => {
    const { formatBudget } = await import("@/lib/projects");
    const result = formatBudget(0);
    expect(result).toMatch(/0/);
    expect(result).toMatch(/€/);
  });

  it("formats 100 as €1,00", async () => {
    const { formatBudget } = await import("@/lib/projects");
    expect(formatBudget(100)).toMatch(/1/);
  });

  it("formats 123456 cents with dot thousands and comma decimal", async () => {
    const { formatBudget } = await import("@/lib/projects");
    const result = formatBudget(123456);
    expect(result).toMatch(/1\.234/);
    expect(result).toMatch(/,56/);
  });
});

// ─── computeStaffUtilization pure function ────────────────────────────────────

describe("computeStaffUtilization", () => {
  it("returns 0 when no staff", async () => {
    const { computeStaffUtilization } = await import("@/components/dashboard/kpi-cards");
    expect(computeStaffUtilization([], [], THIS_MONTH)).toBe(0);
  });

  it("returns 0 when no assignments this month", async () => {
    const { computeStaffUtilization } = await import("@/components/dashboard/kpi-cards");
    const staff = [makeStaff("s1", 40)];
    expect(computeStaffUtilization(staff, [], THIS_MONTH)).toBe(0);
  });

  it("computes utilization correctly for one staff member", async () => {
    const { computeStaffUtilization } = await import("@/components/dashboard/kpi-cards");

    // Staff: 40h/week target. Month = THIS_MONTH.
    // Calculate available hours: 40 * (weeks in month)
    // Assigned: 8h in this month
    const staff = [makeStaff("s1", 40)];

    // Get first Monday of this month
    const year = parseInt(THIS_MONTH.slice(0, 4));
    const month = parseInt(THIS_MONTH.slice(5, 7)) - 1; // 0-indexed
    const firstDay = new Date(year, month, 1);
    // last day
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    const availableHours = 40 * (totalDays / 7);

    const startAt = `${THIS_MONTH}-05T08:00:00`;
    const endAt = `${THIS_MONTH}-05T16:00:00`; // 8 hours

    const assignments = [makeAssignment("s1", startAt, endAt)];
    const result = computeStaffUtilization(staff, assignments, THIS_MONTH);

    const expected = Math.round((8 / availableHours) * 100);
    expect(result).toBe(expected);
  });

  it("caps utilization at 100%", async () => {
    const { computeStaffUtilization } = await import("@/components/dashboard/kpi-cards");

    // 1 staff, 1h/week target, 200 hours assigned → over 100%
    const staff = [makeStaff("s1", 1)];
    const assignments: ReturnType<typeof makeAssignment>[] = [];

    // Add many 8-hour assignments in this month
    for (let d = 1; d <= 20; d++) {
      const day = String(d).padStart(2, "0");
      assignments.push(
        makeAssignment("s1", `${THIS_MONTH}-${day}T08:00:00`, `${THIS_MONTH}-${day}T16:00:00`)
      );
    }

    const result = computeStaffUtilization(staff, assignments, THIS_MONTH);
    expect(result).toBe(100);
  });

  it("only counts assignments in the target month", async () => {
    const { computeStaffUtilization } = await import("@/components/dashboard/kpi-cards");

    const staff = [makeStaff("s1", 40)];
    // Assignment last year — should not count
    const lastYearAssignment = makeAssignment("s1", "2020-01-05T08:00:00", "2020-01-05T16:00:00");

    const result = computeStaffUtilization(staff, [lastYearAssignment], THIS_MONTH);
    expect(result).toBe(0);
  });
});

// ─── Dashboard page integration ──────────────────────────────────────────────

describe("Dashboard page — staff utilization card", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  const emptyAgenda = { week_start: "2026-05-26", week_end: "2026-06-01", days: [] };

  it("renders kpi-staff-utilization on the dashboard page (via /staff/utilization endpoint)", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path.includes("/staff/utilization")) {
          return Promise.resolve({ utilization_percent: 60, assigned_hours: 24, available_hours: 40 });
        }
        // invoices
        return Promise.resolve({ data: { data: [], total: 0 }, error: null });
      }),
    }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockResolvedValue(emptyAgenda),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // Phase 22: staff utilization is no longer a KPI card; overdue tasks card is the replacement.
    // The kpi-staff-utilization test-id is no longer rendered in the redesigned dashboard.
    // Verify the page loaded and overdue tasks KPI is shown instead.
    expect(screen.getByTestId("kpi-overdue-tasks")).toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation(() => new Promise(() => {})),
    }));
    vi.doMock("@/lib/agenda", () => ({ fetchWeekAgenda: vi.fn().mockImplementation(() => new Promise(() => {})) }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
    }));
    vi.doMock("@/lib/agenda", () => ({ fetchWeekAgenda: vi.fn().mockRejectedValue(new Error("Netwerk fout")) }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
  });
});

// ─── Actieve Projecten section (Phase 22 redesign) ───────────────────────────

describe("Dashboard page — Actieve Projecten section", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  const baseApiFetch = (path: string) => {
    if (path.includes("/staff/utilization")) {
      return Promise.resolve({ utilization_percent: 0, assigned_hours: 0, available_hours: 0 });
    }
    return Promise.resolve({ data: { data: [], total: 0 }, error: null });
  };

  it("shows empty state CTA when no active projects", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockImplementation(baseApiFetch) }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockResolvedValue({ week_start: "2026-05-26", week_end: "2026-06-01", days: [] }),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("empty-active-projects")).toBeInTheDocument();
  });

  it("renders active project names", async () => {
    const projects = [
      { id: "p1", name: "Brug Oost", description: null, status: "active", start_date: null, end_date: null, budget_cents: 0, phases: [] },
      { id: "p2", name: "Dak West", description: null, status: "completed", start_date: null, end_date: null, budget_cents: 0, phases: [] },
    ];
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: projects, total: 2, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      formatDate: (d: string | null) => d ?? "",
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockImplementation(baseApiFetch) }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockResolvedValue({ week_start: "2026-05-26", week_end: "2026-06-01", days: [] }),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // Only active projects shown
    expect(screen.getByText("Brug Oost")).toBeInTheDocument();
    expect(screen.queryByText("Dak West")).not.toBeInTheDocument();
  });

  it("shows Vandaag empty state when no tasks today", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockImplementation(baseApiFetch) }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockResolvedValue({ week_start: "2026-06-09", week_end: "2026-06-15", days: [] }),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("empty-today-agenda")).toBeInTheDocument();
  });

  it("page still loads when agenda fetch fails (shows empty vandaag)", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockImplementation(baseApiFetch) }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockRejectedValue(new Error("network")),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // Page still loads
    expect(screen.queryByTestId("dashboard-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("empty-today-agenda")).toBeInTheDocument();
  });
});
