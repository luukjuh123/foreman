import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/financials"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProject = (overrides: Partial<{
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  budget_cents: number | null;
}> = {}) => ({
  id: overrides.id ?? "proj-1",
  owner_id: "user-1",
  name: overrides.name ?? "Nieuwbouw Pand A",
  description: null,
  status: overrides.status ?? "active",
  start_date: "2024-01-15",
  end_date: "2024-12-31",
  budget_cents: overrides.budget_cents !== undefined ? overrides.budget_cents : 500000_00,
  phases: [],
});

const mockTotalCost = (totalCents = 200000_00) => ({
  total_cents: totalCents,
  hourly_rate_cents: 8500,
  breakdown: {
    materials_cents: 100000_00,
    labor_cents: 80000_00,
    equipment_cents: 10000_00,
    overhead_cents: 5000_00,
    other_cents: 5000_00,
  },
  materials_missing_count: 0,
});

const mockListResponse = (projects = [mockProject()]) => ({
  data: projects,
  total: projects.length,
  page: 1,
  per_page: 100,
});

// ---------------------------------------------------------------------------
// FinancialsPage — loading state
// ---------------------------------------------------------------------------

describe("FinancialsPage loading state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders loading skeleton while fetching", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");
    render(<FinancialsPage />);

    expect(screen.getByTestId("financials-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FinancialsPage — error state
// ---------------------------------------------------------------------------

describe("FinancialsPage error state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders error message when projects fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    expect(screen.getByTestId("financials-error")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FinancialsPage — summary cards
// ---------------------------------------------------------------------------

describe("FinancialsPage summary cards", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders Totaal Budget, Besteed, and Resterend summary cards", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse()),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    expect(screen.getByText("Totaal Budget")).toBeInTheDocument();
    expect(screen.getByText("Besteed")).toBeInTheDocument();
    expect(screen.getByText("Resterend")).toBeInTheDocument();
  });

  it("renders the page heading Overzicht Financiën", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse()),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    expect(screen.getByText("Overzicht Financiën")).toBeInTheDocument();
  });

  it("shows budget variance indicator data-testid", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse()),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    expect(screen.getByTestId("budget-variance")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FinancialsPage — per-project rows
// ---------------------------------------------------------------------------

describe("FinancialsPage per-project rows", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("shows project name in a per-project row", async () => {
    const projects = [
      mockProject({ id: "proj-1", name: "Renovatie Kantoor", budget_cents: 100000_00 }),
      mockProject({ id: "proj-2", name: "Nieuwbouw Villa", budget_cents: 200000_00 }),
    ];

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse(projects)),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(50000_00)),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Renovatie Kantoor")).toBeInTheDocument();
      expect(screen.getByText("Nieuwbouw Villa")).toBeInTheDocument();
    });
  });

  it("shows formatted budget for each project row", async () => {
    const projects = [
      mockProject({ id: "proj-1", name: "Project A", budget_cents: 100000_00 }),
    ];

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse(projects)),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(40000_00)),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    await waitFor(() => {
      // budget_cents=100000_00 → €100.000,00 → contains "100.000"
      const budgetEl = screen.getByTestId("budget-proj-1");
      expect(budgetEl).toHaveTextContent("100.000");
    });
  });

  it("shows formatted actual cost (besteed) for each project row", async () => {
    const projects = [
      mockProject({ id: "proj-1", name: "Project A", budget_cents: 100000_00 }),
    ];

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse(projects)),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(40000_00)),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    await waitFor(() => {
      // total_cents=40000_00 → €40.000,00 → contains "40.000"
      const spentEl = screen.getByTestId("spent-proj-1");
      expect(spentEl).toHaveTextContent("40.000");
    });
  });

  it("renders project row with data-testid containing project id", async () => {
    const projects = [
      mockProject({ id: "proj-xyz", name: "Test Project" }),
    ];

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse(projects)),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    await act(async () => {
      render(<FinancialsPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("project-row-proj-xyz")).toBeInTheDocument();
    });
  });
});
