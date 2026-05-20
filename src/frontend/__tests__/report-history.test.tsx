import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/reports/history"),
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
  type: "weekly" | "completion";
  title: string;
  period_start: string | null;
  period_end: string | null;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
}> = {}) => ({
  id: overrides.id ?? "rep-1",
  project_id: overrides.project_id ?? "proj-1",
  type: overrides.type ?? "weekly",
  title: overrides.title ?? "Weekrapport week 10",
  period_start: overrides.period_start !== undefined ? overrides.period_start : "2024-03-04",
  period_end: overrides.period_end !== undefined ? overrides.period_end : "2024-03-10",
  data: {},
  is_shared: overrides.is_shared ?? false,
  share_token: overrides.share_token ?? null,
  created_at: overrides.created_at ?? "2024-03-10T12:00:00Z",
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

const makeProjectListResponse = (projects = [{ id: "proj-1", name: "Nieuwbouw Pand A" }]) => ({
  data: projects,
  total: projects.length,
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

describe("ReportHistoryPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("ReportHistoryPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

describe("ReportHistoryPage — empty state", () => {
  it("shows empty state message when no reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen rapporten/i)).toBeInTheDocument();
    });
  });
});

describe("ReportHistoryPage — renders report list", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders report titles", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeReport({ id: "rep-1", title: "Weekrapport week 10" }),
        makeReport({ id: "rep-2", title: "Eindrapport Project A" }),
      ])
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Weekrapport week 10")).toBeInTheDocument();
      expect(screen.getByText("Eindrapport Project A")).toBeInTheDocument();
    });
  });

  it("renders 'Weekrapport' badge for type weekly", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ type: "weekly" })])
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Weekrapport")).toBeInTheDocument();
    });
  });

  it("renders 'Eindrapport' badge for type completion", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ id: "rep-1", type: "completion", title: "Eindrapport" })])
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Eindrapport").length).toBeGreaterThan(0);
    });
  });

  it("renders created_at date in dd-MM-yyyy format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ created_at: "2024-03-15T10:00:00Z" })])
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("15-03-2024")).toBeInTheDocument();
    });
  });

  it("each report title links to its detail page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ id: "rep-42", title: "Weekrapport week 10" })])
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /weekrapport week 10/i });
      expect(link).toHaveAttribute("href", "/dashboard/reports/rep-42");
    });
  });

  it("renders Bekijk action button per report row", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport({ id: "rep-1" })])
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /bekijk/i })).toBeInTheDocument();
    });
  });
});

describe("ReportHistoryPage — header", () => {
  it("renders Rapporthistorie page title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /rapporthistorie/i })
      ).toBeInTheDocument();
    });
  });
});

describe("ReportHistoryPage — project filter", () => {
  it("renders 'Alle projecten' default option", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/alle projecten/i)).toBeInTheDocument();
    });
  });

  it("fetches with project_id param when project filter is selected", async () => {
    const apiFetch = await getApiFetch();
    // First call: projects list, second call: reports list
    apiFetch
      .mockResolvedValueOnce(makeProjectListResponse())
      .mockResolvedValueOnce(makeListResponse([]));

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => screen.getByText(/alle projecten/i));

    // Select from the native select
    const select = screen.getByRole("combobox");
    apiFetch.mockClear();
    apiFetch.mockResolvedValue(makeListResponse([]));
    fireEvent.change(select, { target: { value: "proj-1" } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("project_id=proj-1")
      );
    });
  });
});

describe("ReportHistoryPage — pagination", () => {
  it("shows next page button when there are more pages", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeReport({ id: `rep-${i}`, title: `Weekrapport week ${i}` })
        ),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("does not show next page button when on last page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeReport()], { total: 1, page: 1, per_page: 20 })
    );

    const { default: ReportHistoryPage } = await import(
      "@/app/dashboard/reports/history/page"
    );
    render(<ReportHistoryPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /volgende/i })).toBeNull();
    });
  });
});
