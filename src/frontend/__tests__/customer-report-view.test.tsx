import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/report/abc123"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeWeeklyReport = () => ({
  id: "report-1",
  project_id: "proj-1",
  type: "weekly" as const,
  title: "Weekrapport 2024-W03",
  period_start: "2024-01-15",
  period_end: "2024-01-21",
  data: {
    project_name: "Nieuwbouw Pand A",
    taken_totaal: 12,
    voltooid: 4,
    uren: 32.5,
    kosten_cents: 485000,
    voltooid_deze_week: [
      { naam: "Fundering gieten", fase: "Fundering", uren: 8 },
      { naam: "Bekisting plaatsen", fase: "Fundering", uren: 6 },
    ],
    uren_per_fase: [
      { fase: "Fundering", uren: 24 },
      { fase: "Ruwbouw", uren: 8.5 },
    ],
    plan_volgende_week: [
      { naam: "Wapening aanbrengen", fase: "Fundering" },
      { naam: "Steigers opbouwen", fase: "Ruwbouw" },
    ],
  },
  is_shared: true,
  share_token: "abc123",
  created_at: "2024-01-22T10:00:00Z",
});

const makeCompletionReport = () => ({
  id: "report-2",
  project_id: "proj-2",
  type: "completion" as const,
  title: "Eindrapport Nieuwbouw Pand B",
  period_start: "2024-01-01",
  period_end: "2024-12-31",
  data: {
    project_name: "Nieuwbouw Pand B",
    taken_totaal: 50,
    voltooid: 50,
    uren: 1200,
    kosten_cents: 8500000,
    timeline: {
      gepland_start: "2024-01-01",
      gepland_eind: "2024-10-31",
      werkelijk_start: "2024-01-08",
      werkelijk_eind: "2024-12-31",
    },
    budget_cents: 9000000,
    fasen: [
      { fase: "Fundering", status: "voltooid", uren: 200, kosten_cents: 1500000 },
      { fase: "Ruwbouw", status: "voltooid", uren: 400, kosten_cents: 3000000 },
      { fase: "Afwerking", status: "voltooid", uren: 600, kosten_cents: 4000000 },
    ],
  },
  is_shared: true,
  share_token: "def456",
  created_at: "2025-01-05T09:00:00Z",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CustomerReportView — weekly report", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders loading state initially", async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "abc123" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("fetches report data using token from URL params", async () => {
    const report = makeWeeklyReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "abc123" })} />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/reports/shared/abc123")
      );
    });
  });

  it("renders weekly report with all sections", async () => {
    const report = makeWeeklyReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "abc123" })} />);

    await waitFor(() => {
      // Title
      expect(screen.getByText("Weekrapport 2024-W03")).toBeInTheDocument();
      // Project name
      expect(screen.getByText("Nieuwbouw Pand A")).toBeInTheDocument();
      // Period
      expect(screen.getByText(/week van/i)).toBeInTheDocument();
      // KPI cards (may duplicate with table headers)
      expect(screen.getAllByText("Taken").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Voltooid").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Uren").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Kosten").length).toBeGreaterThan(0);
      // Sections
      expect(screen.getByText(/voltooid deze week/i)).toBeInTheDocument();
      expect(screen.getByText(/uren per fase/i)).toBeInTheDocument();
      expect(screen.getByText(/plan volgende week/i)).toBeInTheDocument();
    });
  });

  it("renders completed task rows in the voltooid table", async () => {
    const report = makeWeeklyReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "abc123" })} />);

    await waitFor(() => {
      expect(screen.getByText("Fundering gieten")).toBeInTheDocument();
      expect(screen.getByText("Bekisting plaatsen")).toBeInTheDocument();
    });
  });

  it("renders Foreman branding footer", async () => {
    const report = makeWeeklyReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "abc123" })} />);

    await waitFor(() => {
      expect(
        screen.getByText(/rapport gegenereerd door foreman/i)
      ).toBeInTheDocument();
    });
  });

  it("shows error message for invalid token (404 response)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not found" }),
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "invalid-token" })} />);

    await waitFor(() => {
      expect(screen.getByText(/rapport niet gevonden/i)).toBeInTheDocument();
    });
  });
});

describe("CustomerReportView — completion report", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders completion report with timeline section", async () => {
    const report = makeCompletionReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "def456" })} />);

    await waitFor(() => {
      expect(screen.getByText("Eindrapport Nieuwbouw Pand B")).toBeInTheDocument();
      // Timeline section
      expect(screen.getAllByText(/gepland/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/werkelijk/i).length).toBeGreaterThan(0);
    });
  });

  it("renders completion report with budget vs kosten section", async () => {
    const report = makeCompletionReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "def456" })} />);

    await waitFor(() => {
      expect(screen.getAllByText(/budget/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/kosten/i).length).toBeGreaterThan(0);
    });
  });

  it("renders phase summary table for completion report", async () => {
    const report = makeCompletionReport();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => report,
    } as Response);

    const { default: ReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<ReportPage params={Promise.resolve({ token: "def456" })} />);

    await waitFor(() => {
      expect(screen.getByText("Fundering")).toBeInTheDocument();
      expect(screen.getByText("Ruwbouw")).toBeInTheDocument();
      expect(screen.getByText("Afwerking")).toBeInTheDocument();
    });
  });
});
