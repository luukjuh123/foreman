/**
 * Tests for the Phase 19 dashboard KPI widgets:
 * - Active projects count
 * - Overdue tasks count
 * - Monthly revenue (sum of paid invoices this month, euro cents)
 * - Outstanding invoices (sum of sent+overdue invoices, euro cents)
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
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }) }));

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
                { status: "todo", end_date: PAST_DATE },      // overdue
                { status: "in_progress", end_date: PAST_DATE }, // overdue
                { status: "done", end_date: PAST_DATE },         // not overdue (done)
                { status: "todo", end_date: FUTURE_DATE },        // not overdue (future)
                { status: "todo", end_date: null },               // not overdue (no date)
              ],
            }],
          }),
        ],
        total: 1, page: 1, per_page: 20,
      }),
      formatBudget: (c: number) => `€${c}`,
    }));
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }) }));

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
    vi.doMock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }) }));

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
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({
        data: {
          data: [
            { id: "inv1", status: "paid", total_cents: 50000, paid_at: `${thisMonth}-10T00:00:00Z` },
            { id: "inv2", status: "paid", total_cents: 30000, paid_at: `${thisMonth}-15T00:00:00Z` },
            { id: "inv3", status: "paid", total_cents: 20000, paid_at: "2020-01-10T00:00:00Z" }, // last year, exclude
            { id: "inv4", status: "sent", total_cents: 10000, paid_at: null }, // not paid, exclude
          ],
          total: 4,
        },
        error: null,
      }),
    }));

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
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    expect(screen.getByTestId("kpi-monthly-revenue")).toHaveTextContent("0");
  });
});

describe("Dashboard KPI — staff utilization rate", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders staff utilization percentage card", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (c: number) => `€${(c / 100).toFixed(2)}`,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => { render(<DashboardPage />); });

    const kpi = screen.getByTestId("kpi-staff-utilization");
    expect(kpi).toHaveTextContent("%");
  });
});
