import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/reports/rep-1"),
  useParams: vi.fn(() => ({ id: "rep-1" })),
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
  title: string;
  type: string;
  is_shared: boolean;
  share_token: string | null;
  data: Record<string, unknown>;
}> = {}) => ({
  id: overrides.id ?? "rep-1",
  project_id: "proj-1",
  type: overrides.type ?? "weekly",
  title: overrides.title ?? "Weekrapport 2024-W01",
  period_start: "2024-01-01",
  period_end: "2024-01-07",
  data: overrides.data ?? {
    project_name: "Renovatie Keuken",
    summary: "Goed voortgang geboekt",
    kpis: { tasks_done: 5, tasks_total: 10, budget_used_cents: 50000 },
  },
  is_shared: overrides.is_shared ?? false,
  share_token: overrides.share_token ?? null,
  created_at: "2024-01-08T10:00:00",
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReportDetailPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("ReportDetailPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Rapport niet gevonden"));

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-99" })} />);

    await waitFor(() => {
      expect(screen.getByText(/rapport niet gevonden/i)).toBeInTheDocument();
    });
  });
});

describe("ReportDetailPage — renders report", () => {
  it("renders report title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeReport({ title: "Weekrapport 2024-W05" }));

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Weekrapport 2024-W05")).toBeInTheDocument();
    });
  });

  it("renders back button to reports list", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage />);

    await waitFor(() => {
      // Back button is a ghost button with ArrowLeft icon
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("renders PDF download button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pdf downloaden/i })).toBeInTheDocument();
    });
  });

  it("renders share toggle button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeReport({ is_shared: false }));

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delen/i })).toBeInTheDocument();
    });
  });
});

describe("ReportDetailPage — share functionality", () => {
  it("shows share link when report is already shared", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeReport({
        is_shared: true,
        share_token: "abc123",
      })
    );

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /link kopiëren/i })).toBeInTheDocument();
    });
  });

  it("calls share endpoint when Delen button is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(makeReport({ is_shared: false }));
    apiFetch.mockResolvedValueOnce({
      share_token: "tok-xyz",
      share_url: "https://example.com/report/tok-xyz",
    });

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /delen/i }));
    fireEvent.click(screen.getByRole("button", { name: /delen/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/reports/rep-1/share",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows copyable link after sharing", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(makeReport({ is_shared: false }));
    apiFetch.mockResolvedValueOnce({
      share_token: "tok-xyz",
      share_url: "https://example.com/report/tok-xyz",
    });

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /delen/i }));
    fireEvent.click(screen.getByRole("button", { name: /delen/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /link kopiëren/i })).toBeInTheDocument();
    });
  });
});
