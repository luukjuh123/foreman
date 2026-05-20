import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/reports/rep-1"),
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

const makeWeeklyReport = (overrides: Partial<{
  id: string;
  project_id: string;
  type: "weekly" | "completion";
  title: string;
  period_start: string | null;
  period_end: string | null;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
  data: Record<string, unknown>;
}> = {}) => ({
  id: overrides.id ?? "rep-1",
  project_id: overrides.project_id ?? "proj-1",
  type: (overrides.type ?? "weekly") as "weekly" | "completion",
  title: overrides.title ?? "Weekrapport week 10",
  period_start: overrides.period_start !== undefined ? overrides.period_start : "2024-03-04",
  period_end: overrides.period_end !== undefined ? overrides.period_end : "2024-03-10",
  data: overrides.data ?? {
    project_name: "Nieuwbouw Pand A",
    tasks_total: 20,
    tasks_done: 8,
    hours_total: 40,
    cost_cents: 150000,
    phases: [
      { name: "Fundatie", tasks_total: 5, tasks_done: 5 },
      { name: "Ruwbouw", tasks_total: 10, tasks_done: 3 },
    ],
    tasks: [
      { name: "Beton storten", status: "done", phase: "Fundatie" },
      { name: "Wanden optrekken", status: "in_progress", phase: "Ruwbouw" },
    ],
    completed_this_week: ["Beton storten", "Vloer egaliseren"],
    plan_next_week: ["Dakbedekking plaatsen", "Kozijnen monteren"],
  },
  is_shared: overrides.is_shared ?? false,
  share_token: overrides.share_token ?? null,
  created_at: overrides.created_at ?? "2024-03-10T12:00:00Z",
});

const makeCompletionReport = () => ({
  id: "rep-2",
  project_id: "proj-1",
  type: "completion" as const,
  title: "Eindrapport Project A",
  period_start: "2024-01-01",
  period_end: "2024-06-30",
  data: {
    project_name: "Nieuwbouw Pand A",
    tasks_total: 50,
    tasks_done: 50,
    hours_total: 400,
    cost_cents: 2500000,
    phases: [
      { name: "Fundatie", tasks_total: 10, tasks_done: 10 },
    ],
    tasks: [
      { name: "Beton storten", status: "done", phase: "Fundatie" },
    ],
    planned_end_date: "2024-06-01",
    actual_end_date: "2024-06-30",
    budget_cents: 3000000,
    actual_cost_cents: 2500000,
  },
  is_shared: false,
  share_token: null,
  created_at: "2024-07-01T09:00:00Z",
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
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-999" })} />);

    await waitFor(() => {
      expect(screen.getByText(/rapport niet gevonden/i)).toBeInTheDocument();
    });
  });
});

describe("ReportDetailPage — weekly report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders report title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport({ title: "Weekrapport week 10" }));

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /weekrapport week 10/i })).toBeInTheDocument();
    });
  });

  it("renders 'Weekrapport' type badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport({ type: "weekly" }));

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Weekrapport")).toBeInTheDocument();
    });
  });

  it("renders KPI cards: Taken, Voltooid, Uren, Kosten", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/^taken$/i)).toBeInTheDocument();
      expect(screen.getByText(/^voltooid$/i)).toBeInTheDocument();
      expect(screen.getByText(/^uren$/i)).toBeInTheDocument();
      expect(screen.getByText(/^kosten$/i)).toBeInTheDocument();
    });
  });

  it("renders KPI values from report data", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeWeeklyReport({
        data: {
          project_name: "Nieuwbouw Pand A",
          tasks_total: 20,
          tasks_done: 8,
          hours_total: 40,
          cost_cents: 150000,
          phases: [],
          tasks: [],
          completed_this_week: [],
          plan_next_week: [],
        },
      })
    );

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      // tasks_total = 20
      expect(screen.getByText("20")).toBeInTheDocument();
      // tasks_done = 8
      expect(screen.getByText("8")).toBeInTheDocument();
      // hours_total = 40
      expect(screen.getByText("40")).toBeInTheDocument();
    });
  });

  it("renders costs formatted in Dutch currency", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeWeeklyReport({
        data: {
          project_name: "X",
          tasks_total: 1,
          tasks_done: 1,
          hours_total: 8,
          cost_cents: 150000, // €1.500,00
          phases: [],
          tasks: [],
          completed_this_week: [],
          plan_next_week: [],
        },
      })
    );

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/1\.500,00/)).toBeInTheDocument();
    });
  });

  it("renders phase breakdown table", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getAllByText("Fundatie").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Ruwbouw").length).toBeGreaterThan(0);
    });
  });

  it("renders task list", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getAllByText("Beton storten").length).toBeGreaterThan(0);
      expect(screen.getByText("Wanden optrekken")).toBeInTheDocument();
    });
  });

  it("renders 'Voltooid deze week' section for weekly reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/voltooid deze week/i)).toBeInTheDocument();
      expect(screen.getAllByText("Beton storten").length).toBeGreaterThan(0);
      expect(screen.getByText("Vloer egaliseren")).toBeInTheDocument();
    });
  });

  it("renders 'Plan volgende week' section for weekly reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/plan volgende week/i)).toBeInTheDocument();
      expect(screen.getByText("Dakbedekking plaatsen")).toBeInTheDocument();
      expect(screen.getByText("Kozijnen monteren")).toBeInTheDocument();
    });
  });

  it("renders Download PDF button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    });
  });

  it("renders back to overzicht link", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /terug naar overzicht/i })
      ).toBeInTheDocument();
    });
  });
});

describe("ReportDetailPage — completion report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Eindrapport' type badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeCompletionReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-2" })} />);

    await waitFor(() => {
      expect(screen.getAllByText("Eindrapport").length).toBeGreaterThan(0);
    });
  });

  it("renders timeline section for completion reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeCompletionReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-2" })} />);

    await waitFor(() => {
      expect(screen.getAllByText(/gepland/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/werkelijk/i).length).toBeGreaterThan(0);
    });
  });

  it("renders budget vs kosten section for completion reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeCompletionReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-2" })} />);

    await waitFor(() => {
      expect(screen.getAllByText(/budget/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/kosten/i).length).toBeGreaterThan(0);
    });
  });

  it("does NOT render 'Voltooid deze week' for completion reports", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeCompletionReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-2" })} />);

    await waitFor(() => {
      // completion report renders without error
      expect(screen.getByRole("heading", { name: /eindrapport project a/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/voltooid deze week/i)).toBeNull();
  });
});

describe("ReportDetailPage — share", () => {
  it("renders Deel rapport button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeWeeklyReport());

    const { default: ReportDetailPage } = await import(
      "@/app/dashboard/reports/[id]/page"
    );
    render(<ReportDetailPage params={Promise.resolve({ id: "rep-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /deel rapport/i })).toBeInTheDocument();
    });
  });
});
