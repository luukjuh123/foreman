import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/report/tok-abc123"),
  useParams: vi.fn(() => ({ token: "tok-abc123" })),
}));

// Public page does NOT use apiFetch — it uses raw fetch.
// We mock global fetch instead.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePublicReport = (overrides: Partial<{
  title: string;
  type: string;
  data: Record<string, unknown>;
}> = {}) => ({
  id: "rep-1",
  project_id: "proj-1",
  type: overrides.type ?? "weekly",
  title: overrides.title ?? "Weekrapport 2024-W01",
  period_start: "2024-01-01",
  period_end: "2024-01-07",
  data: overrides.data ?? {
    type: "weekly",
    project: {
      id: "proj-1",
      name: "Renovatie Keuken",
      description: null,
      status: "active",
      budget_cents: 500000,
      start_date: "2024-01-01",
      end_date: "2024-03-31",
    },
    period: { start: "2024-01-01", end: "2024-01-07" },
    totals: { task_count: 10, completed_task_count: 5, estimated_hours: 40, labor_cost_cents: 50000 },
    phases: [],
    tasks: [],
    completed_this_week: [],
    hours_by_phase: [],
  },
  is_shared: true,
  share_token: "tok-abc123",
  created_at: "2024-01-08T10:00:00",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PublicReportPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage params={Promise.resolve({ token: "tok-abc123" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("PublicReportPage — invalid token", () => {
  it("shows friendly error when token is invalid", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Rapport niet gevonden" }),
    });

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage params={Promise.resolve({ token: "bad-token" })} />);

    await waitFor(() => {
      expect(screen.getByText(/rapport niet gevonden/i)).toBeInTheDocument();
    });
  });
});

describe("PublicReportPage — renders public report", () => {
  it("renders report title", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePublicReport({ title: "Weekrapport 2024-W01" }),
    });

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage params={Promise.resolve({ token: "tok-abc123" })} />);

    await waitFor(() => {
      expect(screen.getByText("Weekrapport 2024-W01")).toBeInTheDocument();
    });
  });

  it("renders Foreman branding header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePublicReport(),
    });

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage />);

    await waitFor(() => {
      const elements = screen.getAllByText(/foreman/i);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders 'Powered by Foreman' footer", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePublicReport(),
    });

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage />);

    await waitFor(() => {
      expect(screen.getByText(/powered by/i)).toBeInTheDocument();
    });
  });

  it("renders project name from report data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        makePublicReport({
          data: {
            type: "weekly",
            project: {
              id: "proj-2",
              name: "Dakbedekking Hoofdstraat 12",
              description: null,
              status: "active",
              budget_cents: 200000,
              start_date: null,
              end_date: null,
            },
            period: { start: null, end: null },
            totals: { task_count: 8, completed_task_count: 3, estimated_hours: 20, labor_cost_cents: 20000 },
            phases: [],
            tasks: [],
            completed_this_week: [],
            hours_by_phase: [],
          },
        }),
    });

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage />);

    await waitFor(() => {
      expect(screen.getByText("Dakbedekking Hoofdstraat 12")).toBeInTheDocument();
    });
  });

  it("does NOT use apiFetch (no auth header injected)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePublicReport(),
    });
    global.fetch = fetchSpy;

    const { default: PublicReportPage } = await import(
      "@/app/report/[token]/page"
    );
    render(<PublicReportPage params={Promise.resolve({ token: "tok-abc123" })} />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/reports/shared/tok-abc123")
      );
      // Verify no Authorization header
      const callHeaders = fetchSpy.mock.calls[0][1]?.headers ?? {};
      expect(callHeaders).not.toHaveProperty("Authorization");
    });
  });
});
