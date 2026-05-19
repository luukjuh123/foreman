import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useParams: vi.fn(() => ({ id: "project-1" })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

// Sample project data
const mockProject = {
  id: "project-1",
  name: "Testproject",
  description: "Test beschrijving",
  status: "active",
  phases: [
    {
      id: "phase-1",
      name: "Fase 1: Fundering",
      order_index: 1,
      tasks: [
        {
          id: "task-1",
          name: "Grondwerk uitvoeren",
          description: "Grond uitgraven",
          status: "todo",
          priority: 2,
          estimated_hours: 8,
          labor_cost_cents: 96000,
          start_date: null,
          end_date: null,
        },
        {
          id: "task-2",
          name: "Beton storten",
          description: "Fundering beton",
          status: "in_progress",
          priority: 3,
          estimated_hours: 16,
          labor_cost_cents: 192000,
          start_date: null,
          end_date: null,
        },
        {
          id: "task-3",
          name: "Wapening plaatsen",
          description: "Staalwapening",
          status: "done",
          priority: 1,
          estimated_hours: 4,
          labor_cost_cents: 48000,
          start_date: null,
          end_date: null,
        },
        {
          id: "task-4",
          name: "Inspectie",
          description: "Geblokkeerd door leverancier",
          status: "blocked",
          priority: 0,
          estimated_hours: 2,
          labor_cost_cents: 24000,
          start_date: null,
          end_date: null,
        },
      ],
    },
    {
      id: "phase-2",
      name: "Fase 2: Ruwbouw",
      order_index: 2,
      tasks: [
        {
          id: "task-5",
          name: "Muren optrekken",
          description: "Muren bouwen",
          status: "todo",
          priority: 1,
          estimated_hours: 24,
          labor_cost_cents: 288000,
          start_date: null,
          end_date: null,
        },
      ],
    },
  ],
};

// Mock API modules
vi.mock("@/lib/projects", () => ({
  getProject: vi.fn(() => Promise.resolve(mockProject)),
  updateTask: vi.fn(() =>
    Promise.resolve({
      id: "task-1",
      name: "Grondwerk uitvoeren",
      status: "in_progress",
      priority: 2,
      estimated_hours: 8,
    })
  ),
}));

describe("KanbanBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 4 kanban columns with correct Dutch labels", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Te Doen")).toBeInTheDocument();
      expect(screen.getByText("In Uitvoering")).toBeInTheDocument();
      expect(screen.getByText("Voltooid")).toBeInTheDocument();
      expect(screen.getByText("Geblokkeerd")).toBeInTheDocument();
    });
  });

  it("shows tasks in the correct columns based on status", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
      expect(screen.getByText("Beton storten")).toBeInTheDocument();
      expect(screen.getByText("Wapening plaatsen")).toBeInTheDocument();
      expect(screen.getByText("Inspectie")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockImplementationOnce(
      () => new Promise(() => {}) // never resolves
    );

    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders back link to project detail", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      const backLink = screen.getByRole("link", { name: /terug/i });
      expect(backLink).toHaveAttribute("href", "/dashboard/projects/project-1");
    });
  });

  it("renders phase selector with all phases", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Fase 1: Fundering")).toBeInTheDocument();
      expect(screen.getByText("Fase 2: Ruwbouw")).toBeInTheDocument();
    });
  });

  it("switches tasks when a different phase is selected", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    // Initially shows phase 1 tasks
    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    // Click phase 2 tab
    fireEvent.click(screen.getByText("Fase 2: Ruwbouw"));

    await waitFor(() => {
      expect(screen.getByText("Muren optrekken")).toBeInTheDocument();
      expect(screen.queryByText("Grondwerk uitvoeren")).not.toBeInTheDocument();
    });
  });

  it("calls updateTask when move button is clicked", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );
    const { updateTask } = await import("@/lib/projects");

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    // "Grondwerk uitvoeren" is in todo column — click move right button
    const moveButtons = screen.getAllByRole("button", { name: /rechts|vooruit|→/i });
    fireEvent.click(moveButtons[0]);

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(
        "project-1",
        "phase-1",
        "task-1",
        { status: "in_progress" }
      );
    });
  });

  it("shows task count badge in each column header", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      // Each column should show a count — phase 1 has 1 todo, 1 in_progress, 1 done, 1 blocked
      const badges = screen.getAllByTestId("column-count");
      expect(badges.length).toBe(4);
    });
  });

  it("shows empty state when phase has no tasks in a column", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    // Switch to phase 2 — only has 1 todo task
    await waitFor(() => {
      expect(screen.getByText("Fase 2: Ruwbouw")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Fase 2: Ruwbouw"));

    await waitFor(() => {
      // Should show empty state messages for columns with no tasks
      const emptyStates = screen.getAllByTestId("empty-column");
      expect(emptyStates.length).toBeGreaterThan(0);
    });
  });

  it("shows priority badge with correct label", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      // task-2 has priority 3 = urgent
      expect(screen.getByText("Urgent")).toBeInTheDocument();
      // task-1 has priority 2 = hoog
      expect(screen.getByText("Hoog")).toBeInTheDocument();
    });
  });

  it("shows estimated hours for each task", async () => {
    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText(/8 uur/i)).toBeInTheDocument();
      expect(screen.getByText(/16 uur/i)).toBeInTheDocument();
    });
  });

  it("reverts task to original column when API move fails", async () => {
    const { updateTask } = await import("@/lib/projects");
    vi.mocked(updateTask).mockRejectedValueOnce(new Error("Server error"));

    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    // Wait for board to load — task-1 starts in "todo" column
    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    // "todo" column badge starts at 1
    const badgesBefore = screen.getAllByTestId("column-count");
    expect(badgesBefore[0].textContent).toBe("1");

    // Click the forward button on task-1 (todo → in_progress optimistically)
    const moveButtons = screen.getAllByRole("button", { name: /vooruit|→/i });
    fireEvent.click(moveButtons[0]);

    // After API failure, task must revert back to "todo" (badge back to 1)
    await waitFor(() => {
      const badges = screen.getAllByTestId("column-count");
      expect(badges[0].textContent).toBe("1");
    });

    // Task is still visible (did not disappear)
    expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
  });

  it("shows an error message when API move fails", async () => {
    const { updateTask } = await import("@/lib/projects");
    vi.mocked(updateTask).mockRejectedValueOnce(new Error("Server error"));

    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    const moveButtons = screen.getAllByRole("button", { name: /vooruit|→/i });
    fireEvent.click(moveButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("dismisses error banner when close button is clicked", async () => {
    const { updateTask } = await import("@/lib/projects");
    vi.mocked(updateTask).mockRejectedValueOnce(new Error("Server error"));

    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    const moveButtons = screen.getAllByRole("button", { name: /vooruit|→/i });
    fireEvent.click(moveButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /sluiten/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("successful move updates task to new column and shows no error", async () => {
    const { updateTask } = await import("@/lib/projects");
    // updateTask resolves successfully (default mock)

    const { default: KanbanBoardPage } = await import(
      "@/app/dashboard/projects/[id]/board/page"
    );

    render(<KanbanBoardPage />);

    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    const moveButtons = screen.getAllByRole("button", { name: /vooruit|→/i });
    fireEvent.click(moveButtons[0]);

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(
        "project-1",
        "phase-1",
        "task-1",
        { status: "in_progress" }
      );
    });

    // No error banner
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // "in_progress" column now has 2 tasks (badge = "2")
    const badges = screen.getAllByTestId("column-count");
    expect(badges[1].textContent).toBe("2");
  });
});
