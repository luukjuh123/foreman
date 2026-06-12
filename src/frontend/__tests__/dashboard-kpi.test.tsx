/**
 * Tests for the Phase 19 dashboard KPI widgets:
 * - Active projects count
 * - Overdue tasks count
 * - Monthly revenue (sum of paid invoices this month, euro cents)
 * - Outstanding invoices (sum of sent+overdue invoices, euro cents)
 * - Staff utilization rate (Phase 19 addition)
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

// Agenda is fetched on the dashboard page; mock it to return empty week by default.
vi.mock("@/lib/agenda", () => ({
  fetchWeekAgenda: vi.fn().mockResolvedValue({ week_start: "2026-05-26", week_end: "2026-06-01", days: [] }),
  getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
}));

// Helper to build project fixture with phases + tasks
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

const PAST_DATE = "2020-01-01";
const FUTURE_DATE = "2099-12-31";

/** Create a path-aware apiFetch mock that handles both invoices and utilization. */
function mockApiFetch(
  invoices: unknown[] = [],
  utilization = { utilization_percent: 0, assigned_hours: 0, available_hours: 0 },
) {
  vi.doMock("@/lib/api", () => ({
    apiFetch: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/staff/utilization")) {
        return Promise.resolve(utilization);
      }
      return Promise.resolve({ data: { data: invoices, total: invoices.length }, error: null });
    }),
  }));
}

describe("Dashboard KPI — active projects count", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows active project count", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({
        data: [
          makeProject({ id: "1", status: "active" }),
          makeProject({ id: "2", status: "active" }),
          makeProject({ id: "3", status: "completed" }),
        ],
        total: 3, page: 1, per_page: 20,
      }),
      formatBudget: (c: number) => `€${c}`,
    }));
    mockApiFetch();

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("2");
  });
});

describe("Dashboard KPI — overdue tasks", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("counts tasks with past end_date and non-done status as overdue", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({
        data: [
          makeProject({
            id: "1", status: "active",
            phases: [{
              tasks: [
                { status: "todo", end_date: PAST_DATE },        // overdue
                { status: "in_progress", end_date: PAST_DATE }, // overdue
                { status: "done", end_date: PAST_DATE },         // not overdue (done)
                { status: "todo", end_date: FUTURE_DATE },       // not overdue (future)
                { status: "todo", end_date: null },              // not overdue (no date)
              ],
            }],
          }),
        ],
        total: 1, page: 1, per_page: 20,
      }),
      formatBudget: (c: number) => `€${c}`,
    }));
    mockApiFetch();

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("2");
  });

  it("shows 0 when no overdue tasks", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({
        data: [makeProject({ id: "1", status: "active", phases: [{ tasks: [{ status: "done", end_date: PAST_DATE }] }] })],
        total: 1, page: 1, per_page: 20,
      }),
      formatBudget: (c: number) => `€${c}`,
    }));
    mockApiFetch();

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("0");
  });
});

describe("Dashboard KPI — monthly revenue", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  it("sums total_cents of paid invoices from the current month", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));
    mockApiFetch([
      { id: "inv1", status: "paid", total_cents: 50000, paid_at: `${thisMonth}-10T00:00:00Z` },
      { id: "inv2", status: "paid", total_cents: 30000, paid_at: `${thisMonth}-15T00:00:00Z` },
      { id: "inv3", status: "paid", total_cents: 20000, paid_at: "2020-01-10T00:00:00Z" }, // last year, exclude
      { id: "inv4", status: "sent", total_cents: 10000, paid_at: null }, // not paid, exclude
    ]);

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // 50000 + 30000 = 80000 cents = €800.00
    const kpi = screen.getByTestId("kpi-monthly-revenue");
    expect(kpi).toHaveTextContent("800");
  });

  it("shows €0 when no paid invoices this month", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));
    mockApiFetch();

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-monthly-revenue")).toHaveTextContent("0");
  });
});

describe("Dashboard KPI — outstanding invoices (Phase 22 replaces staff utilization KPI)", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders kpi-outstanding-invoices with euro amount", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(c / 100),
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    mockApiFetch([
      { id: "inv1", status: "sent", total_cents: 40000, paid_at: null },
      { id: "inv2", status: "overdue", total_cents: 25000, paid_at: null },
      { id: "inv3", status: "paid", total_cents: 10000, paid_at: "2024-01-01T00:00:00Z" }, // exclude
      { id: "inv4", status: "draft", total_cents: 5000, paid_at: null }, // exclude
    ]);

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    // 40000 + 25000 = 65000 cents = €650,00
    const kpi = screen.getByTestId("kpi-outstanding-invoices");
    expect(kpi).toHaveTextContent("650");
  });
});

// ---------------------------------------------------------------------------
// Dashboard KPI — staff utilization (Phase 19 — backend still fetched, used for aandacht nodig)
// Phase 22: staff utilization KPI card replaced with outstanding invoices card.
// The /staff/utilization endpoint is still called to power the attention panel.
// ---------------------------------------------------------------------------

describe("Dashboard KPI — staff utilization endpoint still called", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("calls /staff/utilization endpoint", async () => {
    const apiFetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.includes("/staff/utilization")) {
        return Promise.resolve({ utilization_percent: 60, assigned_hours: 24, available_hours: 40 });
      }
      return Promise.resolve({ data: { data: [], total: 0 }, error: null });
    });
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    const utilizationCalls = apiFetchMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("/staff/utilization")
    );
    expect(utilizationCalls.length).toBeGreaterThan(0);
  });

  it("kpi-overdue-tasks reflects overdue task count", async () => {
    const PAST = "2020-01-01";
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({
        data: [{
          id: "1", name: "P1", description: null, status: "active", start_date: null, end_date: null, budget_cents: 0,
          phases: [{
            id: "ph1", project_id: "1", name: "Fase 1", description: null, order_index: 0, status: "active",
            start_date: null, end_date: null,
            tasks: [
              { id: "t1", phase_id: "ph1", name: "T1", status: "todo", priority: 0, estimated_hours: null, end_date: PAST },
              { id: "t2", phase_id: "ph1", name: "T2", status: "done", priority: 0, estimated_hours: null, end_date: PAST },
            ],
          }],
        }],
        total: 1, page: 1, per_page: 20,
      }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
      calcTaskSummary: () => ({ done: 1, total: 2 }),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockImplementation((path: string) => {
        if (path.includes("/staff/utilization")) return Promise.resolve({ utilization_percent: 0, assigned_hours: 0, available_hours: 0 });
        return Promise.resolve({ data: { data: [], total: 0 }, error: null });
      }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("1");
  });
});
