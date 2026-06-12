import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/subcontractors"),
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
  kvk_number: string | null;
  specialties: string[];
  hourly_rate_cents: number | null;
  fixed_rate_cents: number | null;
  certifications: Array<{ name: string; expiry_date: string | null }>;
  rating: number | null;
  active: boolean;
}> = {}) => ({
  id: overrides.id ?? "sub-1",
  owner_id: "user-1",
  company_name: overrides.company_name ?? "Loodgieters BV",
  kvk_number: overrides.kvk_number ?? "12345678",
  specialties: overrides.specialties ?? ["loodgieter"],
  hourly_rate_cents: overrides.hourly_rate_cents ?? 7500,
  fixed_rate_cents: overrides.fixed_rate_cents ?? null,
  certifications: overrides.certifications ?? [],
  rating: overrides.rating ?? null,
  active: overrides.active ?? true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeListResponse = (subs: ReturnType<typeof makeSub>[]) => ({
  data: subs,
  total: subs.length,
  page: 1,
  per_page: 20,
});

const makeCostSummary = (subId: string, name: string, cents: number) => ({
  subcontractor_id: subId,
  subcontractor_name: name,
  total_cost_cents: cents,
  project_breakdown: [
    { project_id: "proj-1", project_name: "Nieuwbouw A", cost_cents: cents },
  ],
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: contracting hub page heading
// ---------------------------------------------------------------------------

describe("ContractingHubPage — page heading", () => {
  beforeEach(() => vi.resetModules());

  it("renders Contracting heading", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /contracting/i })
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: tab navigation
// ---------------------------------------------------------------------------

describe("ContractingHubPage — tab navigation", () => {
  beforeEach(() => vi.resetModules());

  it("renders Gids tab", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /gids/i })).toBeInTheDocument();
    });
  });

  it("renders Opdrachten tab", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /opdrachten/i })
      ).toBeInTheDocument();
    });
  });

  it("switches to Opdrachten tab on click", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("tab", { name: /opdrachten/i }));
    fireEvent.click(screen.getByRole("tab", { name: /opdrachten/i }));

    await waitFor(() => {
      expect(screen.getByTestId("opdrachten-tab-panel")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: card-based directory (Gids tab)
// ---------------------------------------------------------------------------

describe("ContractingHubPage — card directory", () => {
  beforeEach(() => vi.resetModules());

  it("renders subcontractor card with company name", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ company_name: "Loodgieters BV" })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Loodgieters BV")).toBeInTheDocument();
    });
  });

  it("renders KVK number on card", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ kvk_number: "87654321" })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/87654321/)).toBeInTheDocument();
    });
  });

  it("renders specialty tags on card", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ specialties: ["elektricien", "loodgieter"] })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getAllByText("elektricien").length).toBeGreaterThan(0);
      expect(screen.getAllByText("loodgieter").length).toBeGreaterThan(0);
    });
  });

  it("renders star rating when rating is present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ rating: 4 })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("sub-rating")).toBeInTheDocument();
    });
  });

  it("renders hourly rate on card formatted as Dutch currency", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ hourly_rate_cents: 9500 })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/95,00/)).toBeInTheDocument();
    });
  });

  it("renders fixed rate label when no hourly rate", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ hourly_rate_cents: null, fixed_rate_cents: 200000 }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("sub-fixed-rate")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: certification badges (60-day amber threshold)
// ---------------------------------------------------------------------------

describe("ContractingHubPage — certification badges", () => {
  beforeEach(() => vi.resetModules());

  it("shows amber warning badge when cert expires within 60 days", async () => {
    const apiFetch = await getApiFetch();
    const soon = new Date();
    soon.setDate(soon.getDate() + 45);
    const expiryDate = soon.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ certifications: [{ name: "VCA", expiry_date: expiryDate }] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByTestId("cert-expiry-warning-amber")
      ).toBeInTheDocument();
    });
  });

  it("shows red badge when cert is expired", async () => {
    const apiFetch = await getApiFetch();
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const expiryDate = past.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ certifications: [{ name: "BRL", expiry_date: expiryDate }] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("cert-expiry-warning-red")).toBeInTheDocument();
    });
  });

  it("shows no warning badge when cert is valid and more than 60 days away", async () => {
    const apiFetch = await getApiFetch();
    const future = new Date();
    future.setDate(future.getDate() + 90);
    const expiryDate = future.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ certifications: [{ name: "VCA", expiry_date: expiryDate }] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("cert-expiry-warning-amber")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("cert-expiry-warning-red")
      ).not.toBeInTheDocument();
    });
  });

  it("renders cert name badge with no warning for valid cert far in future", async () => {
    const apiFetch = await getApiFetch();
    const future = new Date();
    future.setDate(future.getDate() + 365);
    const expiryDate = future.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ certifications: [{ name: "VCA", expiry_date: expiryDate }] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("cert-badge-valid")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: search + specialty filter
// ---------------------------------------------------------------------------

describe("ContractingHubPage — search and specialty filter", () => {
  beforeEach(() => vi.resetModules());

  it("renders search input", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/zoek/i)).toBeInTheDocument();
    });
  });

  it("filters by company name search", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV", specialties: ["loodgieter"] }),
        makeSub({ id: "s2", company_name: "Schilder & Zn", specialties: ["schilder"] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByText("Loodgieters BV"));

    fireEvent.change(screen.getByPlaceholderText(/zoek/i), {
      target: { value: "schilder" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Loodgieters BV")).not.toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });

  it("renders specialty filter dropdown", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ specialties: ["elektricien"] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("specialty-filter")).toBeInTheDocument();
    });
  });

  it("filters cards by selected specialty", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV", specialties: ["loodgieter"] }),
        makeSub({ id: "s2", company_name: "Elektro BV", specialties: ["elektricien"] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByText("Loodgieters BV"));

    const filter = screen.getByTestId("specialty-filter");
    fireEvent.change(filter, { target: { value: "elektricien" } });

    await waitFor(() => {
      expect(screen.queryByText("Loodgieters BV")).not.toBeInTheDocument();
      expect(screen.getByText("Elektro BV")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: cost summary strip
// ---------------------------------------------------------------------------

describe("ContractingHubPage — cost summary strip", () => {
  beforeEach(() => vi.resetModules());

  it("renders cost summary strip", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeListResponse([makeSub({ id: "s1", company_name: "Loodgieters BV" })])
      )
      .mockResolvedValueOnce(
        makeCostSummary("s1", "Loodgieters BV", 500000)
      );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("cost-summary-strip")).toBeInTheDocument();
    });
  });

  it("renders total subcontractor spend", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeListResponse([makeSub({ id: "s1" })])
      )
      .mockResolvedValueOnce(makeCostSummary("s1", "Loodgieters BV", 500000));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      // €5.000,00
      expect(screen.getAllByText(/5\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it("renders per-project breakdown in cost strip", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeListResponse([makeSub({ id: "s1" })])
      )
      .mockResolvedValueOnce(
        makeCostSummary("s1", "Loodgieters BV", 300000)
      );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Nieuwbouw A")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Opdrachten tab
// ---------------------------------------------------------------------------

describe("ContractingHubPage — Opdrachten tab", () => {
  beforeEach(() => vi.resetModules());

  it("shows empty opdrachten message when no subs loaded", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("tab", { name: /opdrachten/i }));
    fireEvent.click(screen.getByRole("tab", { name: /opdrachten/i }));

    await waitFor(() => {
      expect(screen.getByTestId("opdrachten-tab-panel")).toBeInTheDocument();
    });
  });

  it("renders assignment rows with company and project names", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeListResponse([makeSub({ id: "s1", company_name: "Loodgieters BV" })])
      )
      .mockResolvedValueOnce(makeCostSummary("s1", "Loodgieters BV", 300000));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("tab", { name: /opdrachten/i }));
    fireEvent.click(screen.getByRole("tab", { name: /opdrachten/i }));

    await waitFor(() => {
      expect(screen.getByTestId("opdrachten-tab-panel")).toBeInTheDocument();
      // company name appears in opdrachten list
      expect(screen.getAllByText(/loodgieters bv/i).length).toBeGreaterThan(0);
    });
  });

  it("renders agreed rate in opdrachten row", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(
        makeListResponse([makeSub({ id: "s1", hourly_rate_cents: 8500 })])
      )
      .mockResolvedValueOnce(makeCostSummary("s1", "Loodgieters BV", 300000));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("tab", { name: /opdrachten/i }));
    fireEvent.click(screen.getByRole("tab", { name: /opdrachten/i }));

    await waitFor(() => {
      // €85,00 appears somewhere (hourly rate display)
      expect(screen.getAllByText(/85,00/).length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: active/inactive status badge on card
// ---------------------------------------------------------------------------

describe("ContractingHubPage — status badge", () => {
  beforeEach(() => vi.resetModules());

  it("renders Actief badge for active subcontractor", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ active: true })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Actief")).toBeInTheDocument();
    });
  });

  it("renders Inactief badge for inactive subcontractor", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ active: false })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Inactief")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: add/edit dialog still works
// ---------------------------------------------------------------------------

describe("ContractingHubPage — add dialog", () => {
  beforeEach(() => vi.resetModules());

  it("renders Toevoegen button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /toevoegen/i })
      ).toBeInTheDocument();
    });
  });

  it("opens add dialog on Toevoegen click", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("button", { name: /toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /onderaannemer toevoegen/i })
      ).toBeInTheDocument();
    });
  });
});
