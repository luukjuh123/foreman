/**
 * TDD tests for Dashboard Command Center (Phase 22 redesign).
 * Tests written BEFORE implementation — must fail initially (red).
 *
 * Covers:
 *  - Greeting header (Dutch time-of-day greeting + date)
 *  - Quick-action buttons (Nieuw project, Nieuwe factuur)
 *  - Refined KPI row (4 cards: actieve projecten, openstaande facturen, omzet, achterstallige taken)
 *  - Trend indicators on KPI cards
 *  - Money formatting (€1.234,56 from integer cents)
 *  - Actieve projecten cards with progress bar and status badge
 *  - Vandaag agenda strip (today's tasks)
 *  - Aandacht nodig panel (overdue invoices, behind-schedule projects)
 *  - Loading skeletons
 *  - Empty states with CTAs
 *  - Dutch labels throughout
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

// ── Standard mocks ────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProject(opts: {
  id: string;
  name?: string;
  status?: string;
  budget_cents?: number;
  phases?: Array<{
    tasks: Array<{ status: string; end_date: string | null }>;
  }>;
}) {
  return {
    id: opts.id,
    name: opts.name ?? `Project ${opts.id}`,
    description: null,
    status: opts.status ?? "active",
    start_date: null,
    end_date: null,
    budget_cents: opts.budget_cents ?? 100000,
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

function mockDeps(
  projects = [] as ReturnType<typeof makeProject>[],
  invoices: unknown[] = [],
  agendaDays: unknown[] = [],
) {
  vi.doMock("@/lib/projects", () => ({
    listProjects: vi.fn().mockResolvedValue({
      data: projects,
      total: projects.length,
      page: 1,
      per_page: 100,
    }),
    formatBudget: (cents: number) =>
      new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }).format(cents / 100),
    calcTaskSummary: (project: ReturnType<typeof makeProject>) => {
      const tasks = project.phases.flatMap((ph) => ph.tasks);
      return {
        done: tasks.filter((t) => t.status === "done").length,
        total: tasks.length,
      };
    },
  }));

  vi.doMock("@/lib/api", () => ({
    apiFetch: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/staff/utilization")) {
        return Promise.resolve({
          utilization_percent: 0,
          assigned_hours: 0,
          available_hours: 0,
        });
      }
      return Promise.resolve({
        data: { data: invoices, total: invoices.length },
        error: null,
      });
    }),
  }));

  vi.doMock("@/lib/agenda", () => ({
    fetchWeekAgenda: vi.fn().mockResolvedValue({
      week_start: "2026-06-09",
      week_end: "2026-06-15",
      days: agendaDays,
    }),
    fetchDayAgenda: vi.fn().mockResolvedValue({
      date: "2026-06-12",
      tasks: [],
    }),
    getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
  }));
}

// ── Greeting header ───────────────────────────────────────────────────────────

describe("Dashboard Command Center — greeting header", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders a Dutch time-of-day greeting", async () => {
    mockDeps();
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    // One of the Dutch greetings must appear
    const greetings = ["Goedemorgen", "Goedemiddag", "Goedenavond"];
    const found = greetings.some(
      (g) => screen.queryByText(new RegExp(g, "i")) !== null,
    );
    expect(found).toBe(true);
  });

  it("renders today's date in Dutch dd-MM-yyyy format", async () => {
    mockDeps();
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    // Date should look like 12-06-2026
    const dateEl = document.querySelector("[data-testid='greeting-date']");
    expect(dateEl).not.toBeNull();
    expect(dateEl?.textContent).toMatch(/\d{2}-\d{2}-\d{4}/);
  });

  it("renders quick-action button Nieuw project", async () => {
    mockDeps();
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    // May appear in header + empty state CTA
    const links = screen.getAllByRole("link", { name: /nieuw project/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/projects/new");
  });

  it("renders quick-action button Nieuwe factuur", async () => {
    mockDeps();
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(
      screen.getByRole("link", { name: /nieuwe factuur/i }),
    ).toBeInTheDocument();
  });
});

// ── KPI row ───────────────────────────────────────────────────────────────────

describe("Dashboard Command Center — KPI row", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows kpi-active-projects count", async () => {
    mockDeps([
      makeProject({ id: "1", status: "active" }),
      makeProject({ id: "2", status: "active" }),
      makeProject({ id: "3", status: "completed" }),
    ]);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });
    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("2");
  });

  it("shows kpi-outstanding-invoices total in euros", async () => {
    mockDeps(
      [],
      [
        {
          id: "i1",
          status: "sent",
          total_cents: 123456,
          paid_at: null,
        },
        {
          id: "i2",
          status: "overdue",
          total_cents: 67890,
          paid_at: null,
        },
        { id: "i3", status: "paid", total_cents: 50000, paid_at: "2026-06-01" }, // exclude
      ],
    );
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });
    // 123456 + 67890 = 191346 cents = €1.913,46
    const kpi = screen.getByTestId("kpi-outstanding-invoices");
    expect(kpi.textContent).toMatch(/1\.913/);
  });

  it("shows kpi-monthly-revenue from paid invoices this month", async () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    mockDeps(
      [],
      [
        {
          id: "i1",
          status: "paid",
          total_cents: 80000,
          paid_at: `${thisMonth}-05T00:00:00Z`,
        },
      ],
    );
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });
    const kpi = screen.getByTestId("kpi-monthly-revenue");
    expect(kpi.textContent).toMatch(/800/);
  });

  it("shows kpi-overdue-tasks count", async () => {
    const PAST = "2020-01-01";
    mockDeps([
      makeProject({
        id: "1",
        status: "active",
        phases: [
          {
            tasks: [
              { status: "todo", end_date: PAST },
              { status: "in_progress", end_date: PAST },
              { status: "done", end_date: PAST }, // not overdue
            ],
          },
        ],
      }),
    ]);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });
    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("2");
  });
});

// ── Money formatting ──────────────────────────────────────────────────────────

describe("Dashboard Command Center — money formatting", () => {
  it("formatBudget returns Dutch euro format with comma decimals", async () => {
    const { formatBudget } = await import("@/lib/projects");
    // 123456 cents => €1.234,56
    const result = formatBudget(123456);
    // Dutch locale uses period as thousands separator, comma as decimal
    expect(result).toMatch(/1\.234/);
    expect(result).toMatch(/56/);
    expect(result).toMatch(/€/);
  });

  it("formatBudget handles zero cents", async () => {
    const { formatBudget } = await import("@/lib/projects");
    expect(formatBudget(0)).toMatch(/0,00/);
  });

  it("formatBudget handles large amounts", async () => {
    const { formatBudget } = await import("@/lib/projects");
    // 10000000 cents = €100.000,00
    const result = formatBudget(10000000);
    expect(result).toMatch(/100\.000/);
  });
});

// ── Loading skeletons ─────────────────────────────────────────────────────────

describe("Dashboard Command Center — loading state", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows loading skeleton while fetching", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
      formatBudget: (c: number) => `€${c}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchDayAgenda: vi.fn().mockReturnValue(new Promise(() => {})),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("Dashboard Command Center — error state", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows error panel when fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockRejectedValue(new Error("network fout")),
      formatBudget: (c: number) => `€${c}`,
      calcTaskSummary: () => ({ done: 0, total: 0 }),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("network fout")),
    }));
    vi.doMock("@/lib/agenda", () => ({
      fetchWeekAgenda: vi.fn().mockResolvedValue({ week_start: "", week_end: "", days: [] }),
      fetchDayAgenda: vi.fn().mockResolvedValue({ date: "", tasks: [] }),
      getProjectColor: vi.fn().mockReturnValue("#3b82f6"),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
  });
});

// ── Actieve projecten section ─────────────────────────────────────────────────

describe("Dashboard Command Center — actieve projecten section", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders active project cards", async () => {
    mockDeps([
      makeProject({ id: "1", name: "Renovatie Bakker", status: "active" }),
      makeProject({ id: "2", name: "Nieuwbouw De Vries", status: "active" }),
      makeProject({ id: "3", name: "Afgerond project", status: "completed" }),
    ]);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByText("Renovatie Bakker")).toBeInTheDocument();
    expect(screen.getByText("Nieuwbouw De Vries")).toBeInTheDocument();
    // Completed projects should not appear in active section
    expect(screen.queryByText("Afgerond project")).toBeNull();
  });

  it("shows empty state CTA when no active projects", async () => {
    mockDeps([]);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(
      screen.getByTestId("empty-active-projects"),
    ).toBeInTheDocument();
  });

  it("renders progress bar for each active project", async () => {
    mockDeps([
      makeProject({
        id: "1",
        status: "active",
        phases: [
          {
            tasks: [
              { status: "done", end_date: null },
              { status: "todo", end_date: null },
            ],
          },
        ],
      }),
    ]);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    const progressBar = document.querySelector(
      "[data-testid='project-progress-bar']",
    );
    expect(progressBar).not.toBeNull();
  });
});

// ── Vandaag agenda strip ──────────────────────────────────────────────────────

describe("Dashboard Command Center — vandaag agenda strip", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows today's tasks when agenda has tasks for today", async () => {
    const today = new Date().toISOString().split("T")[0];
    mockDeps([], [], [
      {
        date: today,
        tasks: [
          {
            task_id: "t1",
            project_id: "p1",
            project_name: "Badkamer renovatie",
            phase_id: "ph1",
            phase_name: "Fase 1",
            name: "Tegels leggen",
            description: null,
            status: "todo",
            priority: 1,
            estimated_hours: 4,
            start_date: today,
            end_date: today,
            start_time: "09:00",
            end_time: "13:00",
            location: null,
          },
        ],
      },
    ]);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByText("Tegels leggen")).toBeInTheDocument();
  });

  it("shows empty state when no tasks today", async () => {
    mockDeps();
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("empty-today-agenda")).toBeInTheDocument();
  });
});

// ── Aandacht nodig panel ──────────────────────────────────────────────────────

describe("Dashboard Command Center — aandacht nodig panel", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("shows overdue invoices in aandacht nodig panel", async () => {
    mockDeps(
      [],
      [
        {
          id: "i1",
          status: "overdue",
          total_cents: 95000,
          paid_at: null,
        },
      ],
    );
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("attention-panel")).toBeInTheDocument();
    expect(screen.getByTestId("overdue-invoices-count")).toBeInTheDocument();
  });

  it("shows empty state when nothing needs attention", async () => {
    mockDeps([], []);
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("attention-all-clear")).toBeInTheDocument();
  });
});
