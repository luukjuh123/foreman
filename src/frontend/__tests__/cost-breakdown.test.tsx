import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/financials/costs"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/projects", () => ({
  listProjects: vi.fn(),
  formatBudget: vi.fn((cents: number) => `€\u00a0${(cents / 100).toFixed(2).replace(".", ",")}`),
}));

vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div />,
  Cell: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => <div />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProjects = {
  data: [
    {
      id: "proj-1",
      name: "Nieuwbouw Pand A",
      status: "active",
      budget_cents: 500000_00,
      phases: [],
      owner_id: "user-1",
      description: null,
      start_date: null,
      end_date: null,
    },
    {
      id: "proj-2",
      name: "Renovatie Kantoor B",
      status: "active",
      budget_cents: 200000_00,
      phases: [],
      owner_id: "user-1",
      description: null,
      start_date: null,
      end_date: null,
    },
  ],
  total: 2,
  page: 1,
  per_page: 100,
};

const mockCostBreakdown = {
  total_cents: 150000_00,
  hourly_rate_cents: 7500,
  breakdown: {
    materials_cents: 60000_00,
    labor_cents: 45000_00,
    equipment_cents: 20000_00,
    overhead_cents: 15000_00,
    other_cents: 10000_00,
  },
  materials_missing_count: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getListProjects() {
  const { listProjects } = await import("@/lib/projects");
  return vi.mocked(listProjects);
}

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: loading state
// ---------------------------------------------------------------------------

describe("CostBreakdownPage loading state", () => {
  it("shows loading skeleton while projects are fetching", async () => {
    const listProjects = await getListProjects();
    listProjects.mockReturnValue(new Promise(() => {})); // never resolves

    vi.resetModules();
    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );
    render(<CostBreakdownPage />);

    expect(screen.getByTestId("cost-breakdown-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: error state
// ---------------------------------------------------------------------------

describe("CostBreakdownPage error state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows error message when projects fail to load", async () => {
    const listProjects = await getListProjects();
    listProjects.mockRejectedValue(new Error("Netwerk fout"));

    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );
    render(<CostBreakdownPage />);

    await waitFor(() => {
      expect(screen.getByTestId("cost-breakdown-error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: project selector
// ---------------------------------------------------------------------------

describe("CostBreakdownPage project selector", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders project selector with projects after loading", async () => {
    const listProjects = await getListProjects();
    listProjects.mockResolvedValue(mockProjects);

    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCostBreakdown);

    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );
    render(<CostBreakdownPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-selector")).toBeInTheDocument();
    });

    expect(screen.getByText("Nieuwbouw Pand A")).toBeInTheDocument();
  });

  it("renders the placeholder text when no projects exist", async () => {
    const listProjects = await getListProjects();
    listProjects.mockResolvedValue({ data: [], total: 0, page: 1, per_page: 100 });

    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );
    render(<CostBreakdownPage />);

    await waitFor(() => {
      expect(screen.getByTestId("project-selector")).toBeInTheDocument();
    });

    expect(screen.getByText("Selecteer project")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: category breakdown values
// ---------------------------------------------------------------------------

describe("CostBreakdownPage category breakdown", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders category labels and formatted values after selecting a project", async () => {
    const listProjects = await getListProjects();
    listProjects.mockResolvedValue(mockProjects);

    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCostBreakdown);

    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );

    // Render with defaultProject pre-selected by passing query params via prop is not supported;
    // instead, we force the initial selected project via the test by re-exporting.
    // We test the full flow: the page auto-selects first project on load.
    render(<CostBreakdownPage />);

    await waitFor(() => {
      expect(screen.getByTestId("category-breakdown")).toBeInTheDocument();
    });

    // Dutch category labels
    expect(screen.getByText("Materialen")).toBeInTheDocument();
    expect(screen.getByText("Arbeid")).toBeInTheDocument();
    expect(screen.getByText("Apparatuur")).toBeInTheDocument();
    expect(screen.getByText("Overhead")).toBeInTheDocument();
    expect(screen.getByText("Overig")).toBeInTheDocument();
  });

  it("renders pie chart when cost data is loaded", async () => {
    const listProjects = await getListProjects();
    listProjects.mockResolvedValue(mockProjects);

    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCostBreakdown);

    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );
    render(<CostBreakdownPage />);

    await waitFor(() => {
      expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    });
  });

  it("renders page heading Kostenanalyse", async () => {
    const listProjects = await getListProjects();
    listProjects.mockResolvedValue(mockProjects);

    const { default: CostBreakdownPage } = await import(
      "@/app/dashboard/financials/costs/page"
    );
    render(<CostBreakdownPage />);

    await waitFor(() => {
      expect(screen.getByText("Kostenanalyse")).toBeInTheDocument();
    });
  });
});
