import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks — top-level only, no variables from outer scope in factories
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

// Mock the whole projects module — individual functions overridden per suite
vi.mock("@/lib/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects")>();
  return {
    ...actual,
    listProjects: vi.fn(),
    getProject: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockTask = (status: "todo" | "in_progress" | "done" | "blocked") => ({
  id: `task-${status}`,
  phase_id: "phase-1",
  name: `Taak ${status}`,
  status,
  priority: 1,
  estimated_hours: 8,
  labor_cost_cents: null,
});

const mockPhase = (overrides: Partial<{ tasks: ReturnType<typeof mockTask>[] }> = {}) => ({
  id: "phase-1",
  project_id: "proj-1",
  name: "Fundering",
  description: "Funderingswerk",
  order_index: 0,
  status: "active",
  tasks: overrides.tasks ?? [mockTask("done"), mockTask("todo"), mockTask("in_progress")],
});

const mockProject = (overrides: Partial<{
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  phases: ReturnType<typeof mockPhase>[];
  budget_cents: number;
  start_date: string;
  end_date: string;
  created_at: string;
}> = {}) => ({
  id: overrides.id ?? "proj-1",
  owner_id: "user-1",
  name: overrides.name ?? "Nieuwbouw Pand A",
  description: overrides.description ?? "Bouw van een nieuw bedrijfspand met 3 verdiepingen.",
  status: overrides.status ?? "active",
  start_date: overrides.start_date ?? "2024-01-15",
  end_date: overrides.end_date ?? "2024-12-31",
  budget_cents: overrides.budget_cents ?? 500000_00,
  created_at: overrides.created_at ?? "2024-01-01T00:00:00Z",
  phases: overrides.phases ?? [mockPhase()],
});

// ---------------------------------------------------------------------------
// Unit: progress calculation helpers (import real module)
// ---------------------------------------------------------------------------

describe("progress calculation", () => {
  it("calculates phase completion percentage correctly", async () => {
    const { calcPhaseProgress } = await import("@/lib/projects");
    const phase = mockPhase({ tasks: [mockTask("done"), mockTask("done"), mockTask("todo")] });
    expect(calcPhaseProgress(phase)).toBe(67); // 2/3 rounded
  });

  it("returns 0 when no tasks", async () => {
    const { calcPhaseProgress } = await import("@/lib/projects");
    expect(calcPhaseProgress({ ...mockPhase(), tasks: [] })).toBe(0);
  });

  it("returns 100 when all tasks done", async () => {
    const { calcPhaseProgress } = await import("@/lib/projects");
    const phase = mockPhase({ tasks: [mockTask("done"), mockTask("done")] });
    expect(calcPhaseProgress(phase)).toBe(100);
  });

  it("calculates overall project task summary", async () => {
    const { calcTaskSummary } = await import("@/lib/projects");
    const project = mockProject({ phases: [mockPhase()] });
    // phase has done, todo, in_progress — 1 done out of 3
    expect(calcTaskSummary(project)).toEqual({ done: 1, total: 3 });
  });

  it("sums tasks across multiple phases", async () => {
    const { calcTaskSummary } = await import("@/lib/projects");
    const p = mockProject({
      phases: [
        mockPhase({ tasks: [mockTask("done"), mockTask("done")] }),
        mockPhase({ tasks: [mockTask("todo"), mockTask("in_progress")] }),
      ],
    });
    expect(calcTaskSummary(p)).toEqual({ done: 2, total: 4 });
  });
});

// ---------------------------------------------------------------------------
// Unit: formatting helpers
// ---------------------------------------------------------------------------

describe("formatting helpers", () => {
  it("formats budget cents to Dutch euro format", async () => {
    const { formatBudget } = await import("@/lib/projects");
    // 500000_00 = 50_000_000 cents = €500.000,00
    expect(formatBudget(500000_00)).toBe("€\u00a0500.000,00");
  });

  it("formats date string to dd-MM-yyyy", async () => {
    const { formatDate } = await import("@/lib/projects");
    expect(formatDate("2024-01-15")).toBe("15-01-2024");
  });
});

// ---------------------------------------------------------------------------
// ProjectsPage — list page
// ---------------------------------------------------------------------------

const mockListResponse = {
  data: [
    mockProject({ id: "proj-1", status: "active" }),
    mockProject({ id: "proj-2", status: "draft" }),
    mockProject({ id: "proj-3", status: "completed" }),
  ],
  total: 3,
  page: 1,
  per_page: 10,
};

describe("ProjectsPage", () => {
  beforeEach(async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(mockListResponse);
  });

  it("renders Projecten heading", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);
    expect(screen.getByText("Projecten")).toBeInTheDocument();
  });

  it("renders Nieuw project button linking to /dashboard/projects/new", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);
    const links = screen.getAllByRole("link", { name: /nieuw project/i });
    expect(links[0]).toHaveAttribute("href", "/dashboard/projects/new");
  });

  it("renders status filter chips: Alle, Actief, Concept, Voltooid, Gearchiveerd", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);
    expect(screen.getByRole("button", { name: /alle/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /actief/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /concept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /voltooid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gearchiveerd/i })).toBeInTheDocument();
  });

  it("renders project cards after loading", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Nieuwbouw Pand A").length).toBeGreaterThan(0);
    });
  });

  it("shows task summary on a card", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      const summaries = screen.getAllByText(/1\/3 taken/i);
      expect(summaries.length).toBeGreaterThan(0);
    });
  });

  it("filters to only active projects when Actief chip is clicked", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    // Wait for all 3 projects to load (active + draft + completed)
    await waitFor(() => expect(screen.getAllByText("Nieuwbouw Pand A").length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: /^actief/i }));

    // After filtering, only 1 project (active) should remain
    await waitFor(() => {
      expect(screen.getAllByText("Nieuwbouw Pand A").length).toBe(1);
    });
  });

  it("project card links to /dashboard/projects/[id]", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => screen.getAllByText("Nieuwbouw Pand A"));

    const links = screen.getAllByRole("link", { name: /nieuwbouw pand a/i });
    expect(links[0]).toHaveAttribute("href", expect.stringContaining("/dashboard/projects/proj-"));
  });

  it("shows formatted date range", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      // 3 cards, each with the same date range
      const ranges = screen.getAllByText(/15-01-2024/);
      expect(ranges.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // New: search filtering
  // -------------------------------------------------------------------------

  it("filters by search term matching project name", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue({
      data: [
        mockProject({ id: "proj-1", name: "Nieuwbouw Pand A", status: "active" }),
        mockProject({ id: "proj-2", name: "Renovatie Kantoor", status: "active" }),
      ],
      total: 2,
      page: 1,
      per_page: 10,
    });

    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Nieuwbouw Pand A")).toBeInTheDocument();
      expect(screen.getByText("Renovatie Kantoor")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "Renovatie" } });

    await waitFor(() => {
      expect(screen.getByText("Renovatie Kantoor")).toBeInTheDocument();
      expect(screen.queryByText("Nieuwbouw Pand A")).not.toBeInTheDocument();
    });
  });

  it("filters by search term matching description", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue({
      data: [
        mockProject({ id: "proj-1", name: "Project Alpha", description: "kantoor verbouwing", status: "active" }),
        mockProject({ id: "proj-2", name: "Project Beta", description: "woningbouw project", status: "active" }),
      ],
      total: 2,
      page: 1,
      per_page: 10,
    });

    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "woningbouw" } });

    await waitFor(() => {
      expect(screen.getByText("Project Beta")).toBeInTheDocument();
      expect(screen.queryByText("Project Alpha")).not.toBeInTheDocument();
    });
  });

  it("shows empty state with clear button when filters produce no results", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => screen.getAllByText("Nieuwbouw Pand A"));

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });

    await waitFor(() => {
      expect(screen.getByText(/geen resultaten/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /filters wissen/i })).toBeInTheDocument();
    });
  });

  it("clears search when filters wissen is clicked", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => screen.getAllByText("Nieuwbouw Pand A"));

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });

    await waitFor(() => screen.getByRole("button", { name: /filters wissen/i }));
    fireEvent.click(screen.getByRole("button", { name: /filters wissen/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Nieuwbouw Pand A").length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // New: stat cards
  // -------------------------------------------------------------------------

  it("renders summary stat cards after loading", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Actieve projecten")).toBeInTheDocument();
      expect(screen.getByText("Afgerond dit jaar")).toBeInTheDocument();
      expect(screen.getByText("Totale begroting")).toBeInTheDocument();
      expect(screen.getByText("Gem. voortgang")).toBeInTheDocument();
    });
  });

  it("stat card shows correct active project count", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    // mockListResponse has 1 active project
    await waitFor(() => {
      expect(screen.getByText("Actieve projecten")).toBeInTheDocument();
      const activeEl = screen.getByText("Actieve projecten").closest("div");
      expect(activeEl?.textContent).toContain("1");
    });
  });

  // -------------------------------------------------------------------------
  // New: view toggle
  // -------------------------------------------------------------------------

  it("switches to table view when tabelweergave button is clicked", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => screen.getAllByText("Nieuwbouw Pand A"));

    fireEvent.click(screen.getByRole("button", { name: /tabelweergave/i }));

    await waitFor(() => {
      // Table headers should appear
      expect(screen.getByRole("columnheader", { name: /naam/i })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    });
  });

  it("switches back to grid view when rasterweergave button is clicked", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => screen.getAllByText("Nieuwbouw Pand A"));

    // Switch to table
    fireEvent.click(screen.getByRole("button", { name: /tabelweergave/i }));
    // Switch back to grid
    fireEvent.click(screen.getByRole("button", { name: /rasterweergave/i }));

    await waitFor(() => {
      expect(screen.queryByRole("columnheader", { name: /naam/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // New: combined status + search filtering
  // -------------------------------------------------------------------------

  it("applies status filter and search together", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue({
      data: [
        mockProject({ id: "proj-1", name: "Actief Project A", status: "active" }),
        mockProject({ id: "proj-2", name: "Actief Project B", status: "active" }),
        mockProject({ id: "proj-3", name: "Concept Project", status: "draft" }),
      ],
      total: 3,
      page: 1,
      per_page: 10,
    });

    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Actief Project A")).toBeInTheDocument();
    });

    // Filter to active status
    fireEvent.click(screen.getByRole("button", { name: /^actief/i }));
    // Also search for "A"
    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "Project A" } });

    await waitFor(() => {
      expect(screen.getByText("Actief Project A")).toBeInTheDocument();
      expect(screen.queryByText("Actief Project B")).not.toBeInTheDocument();
      expect(screen.queryByText("Concept Project")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ProjectDetailPage
// ---------------------------------------------------------------------------

const projectWithPhases = mockProject({
  phases: [
    mockPhase({ tasks: [mockTask("done"), mockTask("done"), mockTask("todo")] }),
  ],
});

describe("ProjectDetailPage", () => {
  beforeEach(async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(projectWithPhases);
  });

  it("renders back button to /dashboard/projects", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      const backLinks = screen.getAllByRole("link");
      const backLink = backLinks.find((l) => l.getAttribute("href") === "/dashboard/projects");
      expect(backLink).toBeInTheDocument();
    });
  });

  it("renders project name", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Nieuwbouw Pand A")).toBeInTheDocument();
    });
  });

  it("renders phase name", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Fundering")).toBeInTheDocument();
    });
  });

  it("shows phase progress bar with 67% for 2/3 done tasks", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      // Progress indicator text showing 2/3
      expect(screen.getByText(/2\/3 taken/i)).toBeInTheDocument();
    });
  });

  it("expands phase to show tasks when clicked", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByText("Fundering"));

    // Click the phase card to expand it
    fireEvent.click(screen.getByText("Fundering"));

    await waitFor(() => {
      expect(screen.getAllByText(/taak done/i).length).toBeGreaterThan(0);
    });
  });
});
