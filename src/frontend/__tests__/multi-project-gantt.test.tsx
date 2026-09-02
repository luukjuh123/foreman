import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

const mockProjects = [
  {
    id: "proj-1",
    name: "Kantoorgebouw Amsterdam",
    description: "Kantoorgebouw nieuwbouw",
    status: "active",
    start_date: "2025-01-01",
    end_date: "2025-06-30",
    budget_cents: 5000000,
    phases: [
      {
        id: "phase-1",
        project_id: "proj-1",
        name: "Fundering",
        description: null,
        order_index: 1,
        status: "active",
        start_date: "2025-01-01",
        end_date: "2025-02-28",
        tasks: [
          {
            id: "task-1",
            phase_id: "phase-1",
            name: "Grondwerk",
            status: "done",
            priority: 2,
            estimated_hours: 40,
            start_date: "2025-01-05",
            end_date: "2025-01-20",
          },
          {
            id: "task-2",
            phase_id: "phase-1",
            name: "Betonstorten",
            status: "in_progress",
            priority: 3,
            estimated_hours: 24,
            start_date: "2025-01-21",
            end_date: "2025-02-10",
          },
        ],
      },
    ],
  },
  {
    id: "proj-2",
    name: "Woonwijk Rotterdam",
    description: "Sociale woningbouw",
    status: "active",
    start_date: "2025-02-01",
    end_date: "2025-09-30",
    budget_cents: 8000000,
    phases: [
      {
        id: "phase-3",
        project_id: "proj-2",
        name: "Ontwerp",
        description: null,
        order_index: 1,
        status: "active",
        start_date: "2025-02-01",
        end_date: "2025-03-31",
        tasks: [
          {
            id: "task-3",
            phase_id: "phase-3",
            name: "Bouwvergunning",
            status: "todo",
            priority: 1,
            estimated_hours: 8,
            start_date: "2025-02-03",
            end_date: "2025-03-01",
          },
        ],
      },
    ],
  },
];

vi.mock("@/lib/projects", () => ({
  listProjects: vi.fn(() =>
    Promise.resolve({
      data: mockProjects,
      total: 2,
      page: 1,
      per_page: 100,
    })
  ),
}));

describe("PlanningPage (multi-project Gantt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", async () => {
    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);
    // Even while loading it should not throw
    expect(document.body).toBeTruthy();
  });

  it("shows loading state initially", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockImplementationOnce(() => new Promise(() => {}));

    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders correct number of project swimlanes", async () => {
    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      const swimlanes = screen.getAllByTestId("project-swimlane");
      expect(swimlanes).toHaveLength(2);
    });
  });

  it("renders project names in swimlane headers", async () => {
    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      expect(screen.getByText("Kantoorgebouw Amsterdam")).toBeInTheDocument();
      expect(screen.getByText("Woonwijk Rotterdam")).toBeInTheDocument();
    });
  });

  it("today marker is visible in the chart", async () => {
    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      expect(screen.getByTestId("multi-gantt-today-line")).toBeInTheDocument();
    });
  });

  it("clicking a project name navigates to the project detail page", async () => {
    const { useRouter } = await import("next/navigation");
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      expect(screen.getByText("Kantoorgebouw Amsterdam")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Kantoorgebouw Amsterdam"));

    expect(mockPush).toHaveBeenCalledWith("/dashboard/projects/proj-1");
  });

  it("shows task bars for tasks with dates", async () => {
    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      const taskBars = screen.getAllByTestId("multi-gantt-task-bar");
      expect(taskBars.length).toBeGreaterThan(0);
    });
  });

  it("renders zoom controls", async () => {
    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      expect(screen.getByTestId("zoom-week")).toBeInTheDocument();
      expect(screen.getByTestId("zoom-month")).toBeInTheDocument();
      expect(screen.getByTestId("zoom-quarter")).toBeInTheDocument();
    });
  });

  it("shows error message when API fails", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockRejectedValueOnce(new Error("Netwerkfout"));

    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerkfout/i)).toBeInTheDocument();
    });
  });

  it("shows empty state when no active projects", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      per_page: 100,
    });

    const { default: PlanningPage } = await import("@/app/dashboard/planning/page");
    render(<PlanningPage />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
  });
});

describe("MultiProjectGantt component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a timeline header", async () => {
    const { MultiProjectGantt } = await import(
      "@/components/planning/MultiProjectGantt"
    );

    render(
      <MultiProjectGantt
        projects={mockProjects as Parameters<typeof MultiProjectGantt>[0]["projects"]}
        zoomLevel="month"
      />
    );

    expect(screen.getByTestId("multi-gantt-timeline-header")).toBeInTheDocument();
  });

  it("renders one swimlane per project", async () => {
    const { MultiProjectGantt } = await import(
      "@/components/planning/MultiProjectGantt"
    );

    render(
      <MultiProjectGantt
        projects={mockProjects as Parameters<typeof MultiProjectGantt>[0]["projects"]}
        zoomLevel="month"
      />
    );

    const swimlanes = screen.getAllByTestId("project-swimlane");
    expect(swimlanes).toHaveLength(2);
  });

  it("calls onProjectClick with correct id when project label clicked", async () => {
    const { MultiProjectGantt } = await import(
      "@/components/planning/MultiProjectGantt"
    );
    const onProjectClick = vi.fn();

    render(
      <MultiProjectGantt
        projects={mockProjects as Parameters<typeof MultiProjectGantt>[0]["projects"]}
        zoomLevel="month"
        onProjectClick={onProjectClick}
      />
    );

    fireEvent.click(screen.getByText("Kantoorgebouw Amsterdam"));
    expect(onProjectClick).toHaveBeenCalledWith("proj-1");
  });
});
