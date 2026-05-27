import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/gantt"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

vi.mock("@/lib/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects")>();
  return {
    ...actual,
    listProjects: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const mockProjects = [
  {
    id: "proj-1",
    name: "Kantoorgebouw Amsterdam",
    description: "Nieuwbouw kantoor",
    status: "active" as const,
    start_date: offsetIso(-30),
    end_date: offsetIso(60),
    budget_cents: 5000000,
    phases: [
      {
        id: "phase-1",
        project_id: "proj-1",
        name: "Fundering",
        description: null,
        order_index: 1,
        status: "active",
        start_date: offsetIso(-30),
        end_date: offsetIso(0),
        tasks: [
          {
            id: "task-1",
            phase_id: "phase-1",
            name: "Grondwerk",
            description: null,
            status: "done" as const,
            priority: 2,
            estimated_hours: 40,
            start_date: offsetIso(-30),
            end_date: offsetIso(-20),
          },
        ],
      },
    ],
  },
  {
    id: "proj-2",
    name: "Woonwijk Haarlem",
    description: "Nieuwbouw woningen",
    status: "active" as const,
    start_date: offsetIso(-10),
    end_date: offsetIso(90),
    budget_cents: 8000000,
    phases: [
      {
        id: "phase-2",
        project_id: "proj-2",
        name: "Ruwbouw",
        description: null,
        order_index: 1,
        status: "active",
        start_date: offsetIso(-10),
        end_date: offsetIso(40),
        tasks: [
          {
            id: "task-2",
            phase_id: "phase-2",
            name: "Muren optrekken",
            description: null,
            status: "in_progress" as const,
            priority: 1,
            estimated_hours: 80,
            start_date: offsetIso(-5),
            end_date: offsetIso(30),
          },
        ],
      },
    ],
  },
];

const emptyListResponse = { data: [], total: 0, page: 1, per_page: 20 };
const projectsListResponse = { data: mockProjects, total: 2, page: 1, per_page: 20 };

// ---------------------------------------------------------------------------
// MultiProjectGantt component tests
// ---------------------------------------------------------------------------

describe("MultiProjectGantt component", () => {
  it("renders all project names", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);
    expect(screen.getByText("Kantoorgebouw Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("Woonwijk Haarlem")).toBeInTheDocument();
  });

  it("renders phase names under each project", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);
    expect(screen.getByText("Fundering")).toBeInTheDocument();
    expect(screen.getByText("Ruwbouw")).toBeInTheDocument();
  });

  it("renders task bars for each task", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);
    const bars = screen.getAllByTestId("gantt-task-bar");
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it("shows today marker line", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);
    expect(screen.getByTestId("gantt-today-line")).toBeInTheDocument();
  });

  it("projects have distinct colors (different data-project-color attributes)", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);
    const headers = screen.getAllByTestId("multi-gantt-project-header");
    expect(headers.length).toBe(2);
    const colors = headers.map((h) => h.getAttribute("data-project-color"));
    // Two projects must have different color values
    expect(colors[0]).not.toBe(colors[1]);
  });

  it("renders empty state when no projects passed", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={[]} />);
    expect(screen.getByTestId("multi-gantt-empty")).toBeInTheDocument();
  });

  it("collapses a project's phases when project header is clicked", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);

    // Initially phases are visible
    expect(screen.getByText("Fundering")).toBeInTheDocument();

    // Click the first project header to collapse
    const headers = screen.getAllByTestId("multi-gantt-project-header");
    fireEvent.click(headers[0]);

    await waitFor(() => {
      expect(screen.queryByText("Fundering")).not.toBeInTheDocument();
    });
  });

  it("links project header to project detail page", async () => {
    const { MultiProjectGantt } = await import("@/components/gantt/MultiProjectGantt");
    render(<MultiProjectGantt projects={mockProjects} />);
    const link = screen.getByRole("link", { name: /kantoorgebouw amsterdam/i });
    expect(link).toHaveAttribute("href", "/dashboard/projects/proj-1");
  });
});

// ---------------------------------------------------------------------------
// MultiProjectGanttPage tests
// ---------------------------------------------------------------------------

describe("MultiProjectGanttPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockImplementation(() => new Promise(() => {}));

    const { default: Page } = await import("@/app/dashboard/projects/gantt/page");
    render(<Page />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders project names after loading", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(projectsListResponse);

    const { default: Page } = await import("@/app/dashboard/projects/gantt/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Kantoorgebouw Amsterdam")).toBeInTheDocument();
      expect(screen.getByText("Woonwijk Haarlem")).toBeInTheDocument();
    });
  });

  it("shows empty state when no active projects", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(emptyListResponse);

    const { default: Page } = await import("@/app/dashboard/projects/gantt/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("multi-gantt-empty")).toBeInTheDocument();
    });
  });

  it("has a back link to the projects overview", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(projectsListResponse);

    const { default: Page } = await import("@/app/dashboard/projects/gantt/page");
    render(<Page />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /terug/i });
      expect(link).toHaveAttribute("href", "/dashboard/projects");
    });
  });

  it("renders the page title", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(projectsListResponse);

    const { default: Page } = await import("@/app/dashboard/projects/gantt/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/multi-project gantt/i)).toBeInTheDocument();
    });
  });
});
