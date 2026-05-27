import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/subcontractors/costs"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => <div />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSub = (overrides: Partial<{
  id: string;
  company_name: string;
}> = {}) => ({
  id: overrides.id ?? "sub-1",
  owner_id: "user-1",
  company_name: overrides.company_name ?? "Loodgieters BV",
  kvk_number: "12345678",
  specialties: ["loodgieter"],
  hourly_rate_cents: 7500,
  fixed_rate_cents: null,
  certifications: [],
  rating: null,
  active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeSubListResponse = (subs: ReturnType<typeof makeSub>[]) => ({
  data: subs,
  total: subs.length,
  page: 1,
  per_page: 100,
});

const makeCostSummary = (overrides: Partial<{
  subcontractor_id: string;
  subcontractor_name: string;
  total_cost_cents: number;
  project_breakdown: Array<{ project_id: string; project_name: string; cost_cents: number }>;
}> = {}) => ({
  subcontractor_id: overrides.subcontractor_id ?? "sub-1",
  subcontractor_name: overrides.subcontractor_name ?? "Loodgieters BV",
  total_cost_cents: overrides.total_cost_cents ?? 500000,
  project_breakdown: overrides.project_breakdown ?? [
    { project_id: "proj-1", project_name: "Nieuwbouw A", cost_cents: 300000 },
    { project_id: "proj-2", project_name: "Renovatie B", cost_cents: 200000 },
  ],
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: loading
// ---------------------------------------------------------------------------

describe("SubcontractorCostDashboard — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    vi.resetModules();
    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    expect(screen.getByTestId("subcontractor-costs-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: error
// ---------------------------------------------------------------------------

describe("SubcontractorCostDashboard — error state", () => {
  beforeEach(() => vi.resetModules());

  it("shows error when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Fout bij laden"));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("subcontractor-costs-error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: page heading
// ---------------------------------------------------------------------------

describe("SubcontractorCostDashboard — heading", () => {
  beforeEach(() => vi.resetModules());

  it("renders page heading Onderaannemer Kosten", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeSubListResponse([]))
      .mockResolvedValue({ subcontractors: [] });

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getAllByText(/onderaannemer kosten/i).length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: subcontractor spending rows
// ---------------------------------------------------------------------------

describe("SubcontractorCostDashboard — spending rows", () => {
  beforeEach(() => vi.resetModules());

  it("renders subcontractor names and their total costs", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeSubListResponse([
          makeSub({ id: "s1", company_name: "Loodgieters BV" }),
          makeSub({ id: "s2", company_name: "Schilder & Zn" }),
        ])
      )
      .mockResolvedValueOnce(makeCostSummary({ subcontractor_id: "s1", subcontractor_name: "Loodgieters BV", total_cost_cents: 500000 }))
      .mockResolvedValueOnce(makeCostSummary({ subcontractor_id: "s2", subcontractor_name: "Schilder & Zn", total_cost_cents: 250000 }));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Loodgieters BV")).toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });

  it("renders cost totals formatted as Dutch currency", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeSubListResponse([makeSub({ id: "s1", company_name: "Loodgieters BV" })])
      )
      .mockResolvedValueOnce(
        makeCostSummary({ total_cost_cents: 500000 })
      );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      // €5000,00 — appears in summary card and in row; use getAllByText
      expect(screen.getAllByText(/5\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it("renders project breakdown rows for each subcontractor", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeSubListResponse([makeSub({ id: "s1" })])
      )
      .mockResolvedValueOnce(
        makeCostSummary({
          project_breakdown: [
            { project_id: "p1", project_name: "Nieuwbouw A", cost_cents: 300000 },
            { project_id: "p2", project_name: "Renovatie B", cost_cents: 200000 },
          ],
        })
      );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Nieuwbouw A")).toBeInTheDocument();
      expect(screen.getByText("Renovatie B")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: margin analysis
// ---------------------------------------------------------------------------

describe("SubcontractorCostDashboard — margin analysis", () => {
  beforeEach(() => vi.resetModules());

  it("renders Margeanalyse section", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeSubListResponse([makeSub()])
      )
      .mockResolvedValueOnce(makeCostSummary());

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/margeanalyse/i)).toBeInTheDocument();
    });
  });

  it("renders bar chart for spending visualization", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeSubListResponse([makeSub()])
      )
      .mockResolvedValueOnce(makeCostSummary());

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    });
  });

  it("shows empty state when no subcontractors have costs", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(makeSubListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/costs/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/geen onderaannemer kosten/i)).toBeInTheDocument();
    });
  });
});
