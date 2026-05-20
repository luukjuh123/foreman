import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/reports"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeReport = (overrides: Partial<{
  id: string;
  project_id: string;
  type: string;
  title: string;
  is_shared: boolean;
  created_at: string;
}> = {}) => ({
  id: overrides.id ?? "rep-1",
  project_id: overrides.project_id ?? "proj-1",
  type: overrides.type ?? "weekly",
  title: overrides.title ?? "Weekrapport 2024-W01",
  period_start: "2024-01-01",
  period_end: "2024-01-07",
  is_shared: overrides.is_shared ?? false,
  created_at: overrides.created_at ?? "2024-01-08T10:00:00",
});

const makeListResponse = (
  reports: ReturnType<typeof makeReport>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: reports,
  total: overrides.total ?? reports.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

const makeProjectListResponse = () => ({
  data: [
    { id: "proj-1", name: "Renovatie Keuken", status: "active", description: null, start_date: null, end_date: null, budget_cents: null, phases: [] },
    { id: "proj-2", name: "Dakbedekking", status: "active", description: null, start_date: null, end_date: null, budget_cents: null, phases: [] },
  ],
  total: 2,
  page: 1,
  per_page: 100,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReportsListPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("ReportsListPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

describe("ReportsListPage — empty state", () => {
  it("shows empty state message when no reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen rapporten gevonden/i)).toBeInTheDocument();
    });
  });
});

describe("ReportsListPage — header", () => {
  it("renders Rapporten page title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /rapporten/i })).toBeInTheDocument();
    });
  });
});

describe("ReportsListPage — renders report list", () => {
  it("renders report title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ title: "Weekrapport 2024-W01" })])
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText("Weekrapport 2024-W01")).toBeInTheDocument();
    });
  });

  it("renders weekly type as 'Wekelijks' badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ type: "weekly" })])
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText("Wekelijks")).toBeInTheDocument();
    });
  });

  it("renders completion type as 'Afronding' badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ id: "rep-2", type: "completion", title: "Afronding Renovatie" })])
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText("Afronding")).toBeInTheDocument();
    });
  });

  it("renders date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ created_at: "2024-03-15T09:00:00" })])
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText("15-03-2024")).toBeInTheDocument();
    });
  });

  it("each report row links to its detail page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ id: "rep-42", title: "Weekrapport W42" })])
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /weekrapport w42/i });
      expect(link).toHaveAttribute("href", "/dashboard/reports/rep-42");
    });
  });

  it("shows shared status indicator when is_shared is true", async () => {
    const apiFetch = await getApiFetch();
    // Page makes 2 calls: projects list then reports list
    apiFetch
      .mockResolvedValueOnce(makeProjectListResponse())
      .mockResolvedValueOnce(makeListResponse([makeReport({ is_shared: true })]));

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      // "Gedeeld" appears as table header AND as status badge
      const elements = screen.getAllByText("Gedeeld");
      // At least 2: header + the badge in the row
      expect(elements.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("ReportsListPage — report builder form", () => {
  it("renders 'Nieuw rapport' button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nieuw rapport/i })).toBeInTheDocument();
    });
  });
});

describe("ReportsListPage — pagination", () => {
  it("shows next page button when there are more pages", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeReport({ id: `rep-${i}`, title: `Rapport ${i}` })
        ),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("shows Pagina 1 van 2 when two pages exist", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) => makeReport({ id: `rep-${i}`, title: `Rapport ${i}` })),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: ReportsListPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportsListPage />);

    await waitFor(() => {
      expect(screen.getByText(/pagina 1 van 2/i)).toBeInTheDocument();
    });
  });
});
