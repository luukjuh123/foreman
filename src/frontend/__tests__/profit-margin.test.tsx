import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/financials/margins"),
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
  budget_cents: number | null;
}> = {}) => ({
  id: overrides.id ?? "proj-1",
  owner_id: "user-1",
  name: overrides.name ?? "Nieuwbouw Pand A",
  description: null,
  status: "active" as const,
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

const formatBudgetMock = (cents: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("ProfitMarginPage loading state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders loading skeleton while fetching", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    expect(screen.getByTestId("margin-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("ProfitMarginPage error state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders error message when projects fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    expect(screen.getByTestId("margin-error")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Project selector
// ---------------------------------------------------------------------------

describe("ProfitMarginPage project selector", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders the page heading Winstmarge Calculator", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse()),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    expect(screen.getByText("Winstmarge Calculator")).toBeInTheDocument();
  });

  it("renders project selector dropdown", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse()),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    expect(screen.getByTestId("project-selector")).toBeInTheDocument();
  });

  it("populates selector with project names from API", async () => {
    const projects = [
      mockProject({ id: "proj-1", name: "Nieuwbouw Pand A" }),
      mockProject({ id: "proj-2", name: "Renovatie Kantoor" }),
    ];

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse(projects)),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    await waitFor(() => {
      const select = screen.getByTestId("project-selector") as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain("Nieuwbouw Pand A");
      expect(options).toContain("Renovatie Kantoor");
    });
  });
});

// ---------------------------------------------------------------------------
// Margin calculation
// ---------------------------------------------------------------------------

describe("ProfitMarginPage margin calculation", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("shows correct margin: budget=100000, cost=60000 → margin=40000 (40%)", async () => {
    const project = mockProject({ id: "proj-1", name: "Test Project", budget_cents: 100000 });

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse([project])),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(60000)),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    // Wait for the component to settle with data loaded
    await waitFor(() => {
      expect(screen.getByTestId("margin-amount")).toBeInTheDocument();
      expect(screen.getByTestId("margin-percentage")).toBeInTheDocument();
    });

    // margin = 100000 - 60000 = 40000 cents = €400,00
    const marginEl = screen.getByTestId("margin-amount");
    expect(marginEl.textContent).toContain("400,00");

    // percentage = 40%
    const pctEl = screen.getByTestId("margin-percentage");
    expect(pctEl.textContent).toContain("40");
  });

  it("shows budget (Omzet) and cost (Kosten) labels", async () => {
    const project = mockProject({ id: "proj-1", budget_cents: 100000 });

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse([project])),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(60000)),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Omzet/i)).toBeInTheDocument();
      expect(screen.getByText(/Kosten/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Negative margin — red styling indicator
// ---------------------------------------------------------------------------

describe("ProfitMarginPage negative margin", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("shows red styling indicator when cost exceeds budget", async () => {
    // budget=60000, cost=100000 → margin negative
    const project = mockProject({ id: "proj-1", budget_cents: 60000 });

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse([project])),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(100000)),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    await waitFor(() => {
      const indicator = screen.getByTestId("margin-indicator");
      expect(indicator).toBeInTheDocument();
      const isNegativelyStyled =
        indicator.classList.contains("text-red-600") ||
        indicator.classList.contains("text-red-500") ||
        indicator.getAttribute("data-negative") === "true";
      expect(isNegativelyStyled).toBe(true);
    });
  });

  it("shows green styling indicator when budget exceeds cost", async () => {
    // budget=100000, cost=60000 → positive margin
    const project = mockProject({ id: "proj-1", budget_cents: 100000 });

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse([project])),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost(60000)),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    await waitFor(() => {
      const indicator = screen.getByTestId("margin-indicator");
      expect(indicator).toBeInTheDocument();
      const isPositivelyStyled =
        indicator.classList.contains("text-green-600") ||
        indicator.classList.contains("text-green-500") ||
        indicator.getAttribute("data-negative") === "false";
      expect(isPositivelyStyled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Hourly rate input
// ---------------------------------------------------------------------------

describe("ProfitMarginPage hourly rate input", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders hourly rate input with Uurtarief label", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockListResponse()),
      formatBudget: formatBudgetMock,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCost()),
    }));

    const { default: ProfitMarginPage } = await import("@/app/dashboard/financials/margins/page");

    await act(async () => {
      render(<ProfitMarginPage />);
    });

    expect(screen.getByTestId("hourly-rate-input")).toBeInTheDocument();
    expect(screen.getByText(/Uurtarief/i)).toBeInTheDocument();
  });
});
