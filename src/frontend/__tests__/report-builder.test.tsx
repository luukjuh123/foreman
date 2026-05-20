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

const makeProject = (overrides: Partial<{ id: string; name: string }> = {}) => ({
  id: overrides.id ?? "proj-1",
  owner_id: "user-1",
  name: overrides.name ?? "Testproject",
  description: null,
  status: "active" as const,
  start_date: "2024-01-01",
  end_date: null,
  budget_cents: null,
  phases: [],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeProjectListResponse = (projects: ReturnType<typeof makeProject>[]) => ({
  data: projects,
  total: projects.length,
  page: 1,
  per_page: 100,
});

const makeReportResponse = (overrides: Partial<{
  id: string;
  type: "weekly" | "completion";
  title: string;
  project_id: string;
  period_start: string | null;
  period_end: string | null;
  data: Record<string, unknown>;
}> = {}) => ({
  id: overrides.id ?? "rep-1",
  project_id: overrides.project_id ?? "proj-1",
  type: overrides.type ?? "weekly",
  title: overrides.title ?? "Weekrapport - Testproject",
  period_start: overrides.period_start ?? "2024-01-01",
  period_end: overrides.period_end ?? "2024-01-07",
  data: overrides.data ?? {
    task_count: 10,
    completed_count: 7,
    total_hours: 32,
    total_cost_cents: 480000,
  },
  is_shared: false,
  share_token: null,
  created_at: "2024-01-08T10:00:00Z",
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReportBuilderPage — renders project selector", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Rapporten heading", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /rapporten/i })).toBeInTheDocument();
    });
  });

  it("renders Selecteer project label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(screen.getByText(/selecteer project/i)).toBeInTheDocument();
    });
  });

  it("shows project names in dropdown after loading", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeProjectListResponse([
        makeProject({ id: "proj-1", name: "Kantoorverbouwing" }),
        makeProject({ id: "proj-2", name: "Woonhuis Renovatie" }),
      ])
    );

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(screen.getByText("Kantoorverbouwing")).toBeInTheDocument();
      expect(screen.getByText("Woonhuis Renovatie")).toBeInTheDocument();
    });
  });
});

describe("ReportBuilderPage — report type selector", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Weekrapport option", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(screen.getByText(/weekrapport/i)).toBeInTheDocument();
    });
  });

  it("renders Eindrapport option", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(screen.getByText(/eindrapport/i)).toBeInTheDocument();
    });
  });
});

describe("ReportBuilderPage — date picker visibility", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows date picker for weekly type by default", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(screen.getByText(/periode/i)).toBeInTheDocument();
    });
  });

  it("hides date picker when Eindrapport is selected", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText(/eindrapport/i));

    // Click Eindrapport
    fireEvent.click(screen.getByText(/eindrapport/i));

    await waitFor(() => {
      expect(screen.queryByText(/^periode$/i)).not.toBeInTheDocument();
    });
  });

  it("shows date picker again when Weekrapport is re-selected", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText(/eindrapport/i));
    fireEvent.click(screen.getByText(/eindrapport/i));

    await waitFor(() => {
      expect(screen.queryByText(/^periode$/i)).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/weekrapport/i));

    await waitFor(() => {
      expect(screen.getByText(/periode/i)).toBeInTheDocument();
    });
  });
});

describe("ReportBuilderPage — generate report", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Genereer rapport button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeProjectListResponse([]));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /genereer rapport/i })
      ).toBeInTheDocument();
    });
  });

  it("calls POST /reports/generate with project_id and type on submit", async () => {
    const apiFetch = await getApiFetch();
    // First call: load projects
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    // Second call: generate report
    apiFetch.mockResolvedValueOnce(makeReportResponse());

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    // Wait for project to appear and select it
    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));

    // Click generate
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/reports/generate",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("proj-1"),
        })
      );
    });
  });

  it("shows loading state while generating", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    // Generation never resolves during this test
    apiFetch.mockReturnValueOnce(new Promise(() => {}));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(screen.getByText(/bezig/i)).toBeInTheDocument();
    });
  });
});

describe("ReportBuilderPage — report preview", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows preview section with report title after generation", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeReportResponse({ title: "Weekrapport - Testproject" })
    );

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(screen.getByText(/weekrapport - testproject/i)).toBeInTheDocument();
    });
  });

  it("shows Taken KPI card with task count", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeReportResponse({
        data: { task_count: 10, completed_count: 7, total_hours: 32, total_cost_cents: 480000 },
      })
    );

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(screen.getByText("Taken")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });

  it("shows Voltooid KPI card with completed count", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeReportResponse({
        data: { task_count: 10, completed_count: 7, total_hours: 32, total_cost_cents: 480000 },
      })
    );

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(screen.getByText("Voltooid")).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("shows Uren KPI card with total hours", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeReportResponse({
        data: { task_count: 10, completed_count: 7, total_hours: 32, total_cost_cents: 480000 },
      })
    );

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(screen.getByText("Uren")).toBeInTheDocument();
      expect(screen.getByText("32")).toBeInTheDocument();
    });
  });

  it("shows Kosten KPI card with formatted cost", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeReportResponse({
        data: { task_count: 10, completed_count: 7, total_hours: 32, total_cost_cents: 480000 },
      })
    );

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(screen.getByText("Kosten")).toBeInTheDocument();
      // €4.800,00 in Dutch locale (480000 cents = 4800 euro)
      expect(screen.getByText(/4\.800/)).toBeInTheDocument();
    });
  });

  it("renders Download PDF button after generation", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(makeReportResponse({ id: "rep-42" }));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /download pdf/i })
      ).toBeInTheDocument();
    });
  });

  it("renders Deel rapport button after generation", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(makeReportResponse({ id: "rep-42" }));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /deel rapport/i })
      ).toBeInTheDocument();
    });
  });
});

describe("ReportBuilderPage — Download PDF", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls /reports/{id}/pdf when Download PDF is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(makeReportResponse({ id: "rep-42" }));
    // PDF fetch returns a blob-like response
    apiFetch.mockResolvedValueOnce(new Blob(["pdf-content"], { type: "application/pdf" }));

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => screen.getByRole("button", { name: /download pdf/i }));
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/reports/rep-42/pdf",
        expect.objectContaining({ method: "GET" })
      );
    });
  });
});

describe("ReportBuilderPage — Deel rapport", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls POST /reports/{id}/share when Deel rapport is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(makeReportResponse({ id: "rep-42" }));
    // Share call returns share response
    apiFetch.mockResolvedValueOnce({
      share_token: "tok-abc",
      share_url: "https://example.com/share/tok-abc",
    });

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => screen.getByRole("button", { name: /deel rapport/i }));
    fireEvent.click(screen.getByRole("button", { name: /deel rapport/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/reports/rep-42/share",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows share URL after successful share", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeProjectListResponse([makeProject({ id: "proj-1", name: "Testproject" })])
    );
    apiFetch.mockResolvedValueOnce(makeReportResponse({ id: "rep-42" }));
    apiFetch.mockResolvedValueOnce({
      share_token: "tok-abc",
      share_url: "https://example.com/share/tok-abc",
    });

    const { default: ReportBuilderPage } = await import(
      "@/app/dashboard/reports/page"
    );
    render(<ReportBuilderPage />);

    await waitFor(() => screen.getByText("Testproject"));
    fireEvent.click(screen.getByText("Testproject"));
    fireEvent.click(screen.getByRole("button", { name: /genereer rapport/i }));

    await waitFor(() => screen.getByRole("button", { name: /deel rapport/i }));
    fireEvent.click(screen.getByRole("button", { name: /deel rapport/i }));

    await waitFor(() => {
      expect(screen.getByText(/tok-abc/)).toBeInTheDocument();
    });
  });
});
