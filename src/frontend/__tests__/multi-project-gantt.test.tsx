import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useParams: vi.fn(() => ({})),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Mock data: two distinct active projects
// ---------------------------------------------------------------------------

const mockProjectA = {
  id: "project-a",
  name: "Kantoorgebouw Amsterdam",
  description: "Nieuwbouw kantoor",
  status: "active",
  start_date: offsetIso(-30),
  end_date: offsetIso(90),
  budget_cents: 50000000,
  phases: [
    {
      id: "phase-a1",
      project_id: "project-a",
      name: "Fundering",
      description: null,
      order_index: 1,
      status: "active",
      start_date: offsetIso(-30),
      end_date: offsetIso(30),
      tasks: [
        {
          id: "task-a1",
          phase_id: "phase-a1",
          name: "Grondwerk",
          description: null,
          status: "done",
          priority: 2,
          estimated_hours: 40,
          start_date: offsetIso(-30),
          end_date: offsetIso(-20),
        },
        {
          id: "task-a2",
          phase_id: "phase-a1",
          name: "Beton storten",
          description: null,
          status: "in_progress",
          priority: 3,
          estimated_hours: 80,
          start_date: offsetIso(-10),
          end_date: offsetIso(20),
        },
      ],
    },
  ],
};

const mockProjectB = {
  id: "project-b",
  name: "Verbouwing Rotterdam",
  description: "Renovatie pand",
  status: "active",
  start_date: offsetIso(-10),
  end_date: offsetIso(60),
  budget_cents: 20000000,
  phases: [
    {
      id: "phase-b1",
      project_id: "project-b",
      name: "Sloopwerk",
      description: null,
      order_index: 1,
      status: "active",
      start_date: offsetIso(-10),
      end_date: offsetIso(20),
      tasks: [
        {
          id: "task-b1",
          phase_id: "phase-b1",
          name: "Muren verwijderen",
          description: null,
          status: "todo",
          priority: 1,
          estimated_hours: 24,
          start_date: offsetIso(-10),
          end_date: offsetIso(5),
        },
      ],
    },
  ],
};

const mockInactiveProject = {
  id: "project-c",
  name: "Gearchiveerd Project",
  description: null,
  status: "archived",
  start_date: offsetIso(-100),
  end_date: offsetIso(-50),
  budget_cents: 0,
  phases: [],
};

vi.mock("@/lib/projects", () => ({
  listProjects: vi.fn(() =>
    Promise.resolve({
      data: [mockProjectA, mockProjectB, mockInactiveProject],
      total: 3,
      page: 1,
      per_page: 100,
    })
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MultiProjectGanttPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the module mock to default implementation after each test
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue({
      data: [mockProjectA, mockProjectB, mockInactiveProject],
      total: 3,
      page: 1,
      per_page: 100,
    });
  });

  it("shows loading state initially", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockImplementationOnce(() => new Promise(() => {}));

    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders project headers for each active project", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Kantoorgebouw Amsterdam").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Verbouwing Rotterdam").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does not render inactive/archived projects", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.queryByText("Gearchiveerd Project")).not.toBeInTheDocument();
    });
  });

  it("renders project headers with data-testid for color-coding", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      const headers = screen.getAllByTestId("project-gantt-header");
      expect(headers.length).toBe(2); // Only active projects
    });
  });

  it("project headers have distinct colors (different style attributes)", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      const headers = screen.getAllByTestId("project-gantt-header");
      expect(headers.length).toBe(2);
      // Each header should have a borderLeft style (color indicator)
      const style0 = headers[0].getAttribute("style") ?? "";
      const style1 = headers[1].getAttribute("style") ?? "";
      // They should be different colors
      expect(style0).not.toBe(style1);
    });
  });

  it("renders tasks from project A in their group", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Grondwerk").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Beton storten").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders tasks from project B in their group", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Muren verwijderen").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders task bars for all active project tasks", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      // 2 tasks from project A + 1 task from project B = 3 total
      const bars = screen.getAllByTestId("gantt-task-bar");
      expect(bars.length).toBe(3);
    });
  });

  it("shows empty state when no active projects exist", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValueOnce({
      data: [mockInactiveProject],
      total: 1,
      page: 1,
      per_page: 100,
    });

    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.getByTestId("no-active-projects")).toBeInTheDocument();
    });
  });

  it("shows the today line", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.getByTestId("gantt-today-line")).toBeInTheDocument();
    });
  });

  it("renders the GanttTimeline header", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      // Timeline renders day cells
      const dayCells = screen.getAllByTestId("gantt-day-cell");
      expect(dayCells.length).toBeGreaterThan(0);
    });
  });

  it("has a page title in Dutch", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      // The h1 heading contains Dutch text for the combined planning view
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toMatch(/planning|gantt|projecten/i);
    });
  });

  it("renders phase name labels under each project", async () => {
    const { default: MultiProjectGanttPage } = await import(
      "@/app/dashboard/projects/gantt/page"
    );
    render(<MultiProjectGanttPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Fundering").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Sloopwerk").length).toBeGreaterThanOrEqual(1);
    });
  });
});
