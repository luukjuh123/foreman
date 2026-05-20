import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/financials/materials"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProjects = {
  data: [
    {
      id: "proj-1",
      name: "Nieuwbouw Pand A",
      description: null,
      status: "active" as const,
      start_date: "2024-01-15",
      end_date: "2024-12-31",
      budget_cents: 500000_00,
      phases: [],
    },
    {
      id: "proj-2",
      name: "Renovatie Kantoor B",
      description: null,
      status: "active" as const,
      start_date: "2024-03-01",
      end_date: null,
      budget_cents: 120000_00,
      phases: [],
    },
  ],
  total: 2,
  page: 1,
  per_page: 100,
};

const mockTotalCostWithMaterials = {
  project_id: "proj-1",
  breakdown: {
    labor_cents: 250000_00,
    materials_cents: 75000_00,
    other_cents: 0,
  },
  total_cents: 325000_00,
  materials_missing_count: 3,
};

const mockTotalCostNoMissing = {
  project_id: "proj-1",
  breakdown: {
    labor_cents: 250000_00,
    materials_cents: 50000_00,
    other_cents: 0,
  },
  total_cents: 300000_00,
  materials_missing_count: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MaterialCostTrackerPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("shows loading state while fetching", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");
    render(<Page />);

    expect(screen.getByTestId("materials-loading")).toBeInTheDocument();
  });

  it("shows error state when projects fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockRejectedValue(new Error("Netwerkfout")),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("Netwerkfout")),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("materials-error")).toBeInTheDocument();
  });

  it("renders the page heading in Dutch", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostWithMaterials),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByText("Materiaalkosten")).toBeInTheDocument();
  });

  it("renders project selector dropdown", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostWithMaterials),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("project-selector")).toBeInTheDocument();
  });

  it("populates project selector with project names", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostWithMaterials),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const selector = screen.getByTestId("project-selector") as HTMLSelectElement;
    const options = Array.from(selector.options).map((o) => o.text);
    expect(options).toContain("Nieuwbouw Pand A");
    expect(options).toContain("Renovatie Kantoor B");
  });

  it("shows total materials cost after loading", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostWithMaterials),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    // materials_cents = 75000_00 = 7_500_000 cents = €75.000,00
    const totalEl = screen.getByTestId("materials-total");
    expect(totalEl).toBeInTheDocument();
    expect(totalEl.textContent).toContain("75.000");
  });

  it("shows missing price warning badge when materials_missing_count > 0", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostWithMaterials),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("missing-price-badge")).toBeInTheDocument();
    expect(screen.getByTestId("missing-price-badge").textContent).toContain("3");
  });

  it("does not show missing price badge when materials_missing_count is 0", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostNoMissing),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.queryByTestId("missing-price-badge")).not.toBeInTheDocument();
  });

  it("shows placeholder message for detailed material list", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockTotalCostWithMaterials),
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(
      screen.getByText(/Gedetailleerde materiaallijst beschikbaar na koppeling met bouwmarkt/i)
    ).toBeInTheDocument();
  });

  it("fetches cost for newly selected project", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(mockTotalCostWithMaterials);

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue(mockProjects),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: apiFetchMock,
    }));

    const { default: Page } = await import("@/app/dashboard/financials/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const selector = screen.getByTestId("project-selector") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selector, { target: { value: "proj-2" } });
    });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining("proj-2")
      );
    });
  });
});
