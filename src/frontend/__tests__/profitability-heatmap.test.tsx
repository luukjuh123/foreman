import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/financials/profitability"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockMargin = (overrides: Partial<{
  project_id: string;
  project_name: string;
  revenue_cents: number;
  labor_cost_cents: number;
  material_cost_cents: number;
  margin_cents: number;
  margin_percentage: number;
}> = {}) => ({
  project_id: overrides.project_id ?? "proj-1",
  project_name: overrides.project_name ?? "Nieuwbouw Pand A",
  revenue_cents: overrides.revenue_cents ?? 100_000_00,
  labor_cost_cents: overrides.labor_cost_cents ?? 30_000_00,
  material_cost_cents: overrides.material_cost_cents ?? 20_000_00,
  margin_cents: overrides.margin_cents ?? 50_000_00,
  margin_percentage: overrides.margin_percentage ?? 50.0,
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

describe("ProfitabilityHeatmapPage loading state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders loading skeleton while fetching", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    expect(screen.getByTestId("heatmap-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("ProfitabilityHeatmapPage error state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders error message when API fetch fails", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    expect(screen.getByTestId("heatmap-error")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Heading and structure
// ---------------------------------------------------------------------------

describe("ProfitabilityHeatmapPage structure", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders the page heading", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue([mockMargin()]),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    expect(screen.getByText("Winstgevendheid Heatmap")).toBeInTheDocument();
  });

  it("renders date range picker inputs", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    expect(screen.getByTestId("date-start")).toBeInTheDocument();
    expect(screen.getByTestId("date-end")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Heatmap grid cells
// ---------------------------------------------------------------------------

describe("ProfitabilityHeatmapPage heatmap grid", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders a heatmap cell for each project", async () => {
    const margins = [
      mockMargin({ project_id: "proj-1", project_name: "Project Alpha" }),
      mockMargin({ project_id: "proj-2", project_name: "Project Beta" }),
    ];

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(margins),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("heatmap-cell-proj-1")).toBeInTheDocument();
      expect(screen.getByTestId("heatmap-cell-proj-2")).toBeInTheDocument();
    });
  });

  it("renders project name in each heatmap cell", async () => {
    const margins = [
      mockMargin({ project_id: "proj-1", project_name: "Renovatie Kantoor" }),
    ];

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(margins),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Renovatie Kantoor")).toBeInTheDocument();
    });
  });

  it("positive margin cell has green color class", async () => {
    const margins = [
      mockMargin({
        project_id: "proj-green",
        margin_cents: 50_000,
        margin_percentage: 50.0,
      }),
    ];

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(margins),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      const cell = screen.getByTestId("heatmap-cell-proj-green");
      const hasGreen =
        cell.className.includes("green") ||
        cell.getAttribute("data-positive") === "true";
      expect(hasGreen).toBe(true);
    });
  });

  it("negative margin cell has red color class", async () => {
    const margins = [
      mockMargin({
        project_id: "proj-red",
        margin_cents: -10_000,
        margin_percentage: -10.0,
      }),
    ];

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(margins),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      const cell = screen.getByTestId("heatmap-cell-proj-red");
      const hasRed =
        cell.className.includes("red") ||
        cell.getAttribute("data-negative") === "true";
      expect(hasRed).toBe(true);
    });
  });

  it("renders margin percentage in each cell", async () => {
    const margins = [
      mockMargin({
        project_id: "proj-pct",
        margin_percentage: 42.5,
      }),
    ];

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(margins),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      const cell = screen.getByTestId("heatmap-cell-proj-pct");
      expect(cell.textContent).toContain("42");
    });
  });

  it("empty state: renders message when no projects returned", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("heatmap-empty")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Click navigates to cost breakdown
// ---------------------------------------------------------------------------

describe("ProfitabilityHeatmapPage navigation", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("clicking a cell navigates to the project cost breakdown page", async () => {
    const push = vi.fn();
    vi.doMock("next/navigation", () => ({
      useRouter: vi.fn(() => ({ push })),
      usePathname: vi.fn(() => "/dashboard/financials/profitability"),
    }));

    const margins = [
      mockMargin({ project_id: "proj-nav", project_name: "Nav Project" }),
    ];

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(margins),
    }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("heatmap-cell-proj-nav")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("heatmap-cell-proj-nav"));

    expect(push).toHaveBeenCalledWith(
      expect.stringContaining("proj-nav")
    );
  });
});

// ---------------------------------------------------------------------------
// Date range filter triggers refetch
// ---------------------------------------------------------------------------

describe("ProfitabilityHeatmapPage date range filter", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("changing start_date input refetches data", async () => {
    const apiFetch = vi.fn().mockResolvedValue([mockMargin()]);

    vi.doMock("@/lib/api", () => ({ apiFetch }));
    vi.doMock("@/lib/projects", () => ({
      formatBudget: formatBudgetMock,
    }));

    const { default: ProfitabilityHeatmapPage } = await import(
      "@/app/dashboard/financials/profitability/page"
    );

    await act(async () => {
      render(<ProfitabilityHeatmapPage />);
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    const startInput = screen.getByTestId("date-start");
    fireEvent.change(startInput, { target: { value: "2024-01-01" } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(2);
    });
  });
});
