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

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

// Build a project whose date range spans today so the today-line is always visible.
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}
function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const mockProject = {
  id: "project-1",
  name: "Kantoorgebouw Amsterdam",
  description: "Nieuwbouw kantoor",
  status: "active",
  start_date: offsetIso(-30),
  end_date: offsetIso(180),
  budget_cents: 50000000,
  phases: [
    {
      id: "phase-1",
      project_id: "project-1",
      name: "Fundering",
      description: null,
      order_index: 1,
      status: "active",
      start_date: offsetIso(-30),
      end_date: offsetIso(30),
      tasks: [
        {
          id: "task-1",
          phase_id: "phase-1",
          name: "Grondwerk",
          description: null,
          status: "done",
          priority: 2,
          estimated_hours: 40,
          start_date: offsetIso(-30),
          end_date: offsetIso(-20),
        },
        {
          id: "task-2",
          phase_id: "phase-1",
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
    {
      id: "phase-2",
      project_id: "project-1",
      name: "Ruwbouw",
      description: null,
      order_index: 2,
      status: "active",
      start_date: offsetIso(31),
      end_date: offsetIso(180),
      tasks: [
        {
          id: "task-3",
          phase_id: "phase-2",
          name: "Muren optrekken",
          description: null,
          status: "todo",
          priority: 1,
          estimated_hours: 120,
          start_date: offsetIso(31),
          end_date: offsetIso(120),
        },
      ],
    },
  ],
};

vi.mock("@/lib/projects", () => ({
  getProject: vi.fn(() => Promise.resolve(mockProject)),
  updateTask: vi.fn(() =>
    Promise.resolve({
      id: "task-1",
      phase_id: "phase-1",
      name: "Grondwerk",
      status: "done",
      priority: 2,
      estimated_hours: 40,
      start_date: offsetIso(-28),
      end_date: offsetIso(-18),
    })
  ),
}));

// ---------------------------------------------------------------------------
// GanttTimeline
// ---------------------------------------------------------------------------

describe("GanttTimeline", () => {
  it("renders correct number of day columns for a date range", async () => {
    const { GanttTimeline } = await import("@/components/gantt/GanttTimeline");
    const start = new Date("2025-01-01");
    const end = new Date("2025-01-07");
    render(<GanttTimeline startDate={start} endDate={end} dayWidthPx={40} />);

    const dayCells = screen.getAllByTestId("gantt-day-cell");
    expect(dayCells.length).toBe(7);
  });

  it("shows at least one week marker over a 14-day range", async () => {
    const { GanttTimeline } = await import("@/components/gantt/GanttTimeline");
    const start = new Date("2025-01-01");
    const end = new Date("2025-01-14");
    render(<GanttTimeline startDate={start} endDate={end} dayWidthPx={40} />);

    const weekMarkers = screen.getAllByTestId("gantt-week-marker");
    expect(weekMarkers.length).toBeGreaterThan(0);
  });

  it("applies dayWidthPx style to each day cell", async () => {
    const { GanttTimeline } = await import("@/components/gantt/GanttTimeline");
    const start = new Date("2025-01-01");
    const end = new Date("2025-01-03");
    render(<GanttTimeline startDate={start} endDate={end} dayWidthPx={40} />);

    const dayCells = screen.getAllByTestId("gantt-day-cell");
    expect(dayCells[0]).toHaveStyle({ width: "40px" });
  });
});

// ---------------------------------------------------------------------------
// GanttRow
// ---------------------------------------------------------------------------

describe("GanttRow", () => {
  const baseTask = {
    id: "task-1",
    phase_id: "phase-1",
    name: "Grondwerk",
    description: null,
    status: "done" as const,
    priority: 2,
    estimated_hours: 40,
    start_date: "2025-01-01",
    end_date: "2025-01-15",
  };

  const chartStart = new Date("2025-01-01");
  const dayWidthPx = 40;

  it("renders the task name inside the bar", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={baseTask}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByText("Grondwerk")).toBeInTheDocument();
  });

  it("colors done tasks green", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={baseTask}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByTestId("gantt-task-bar").className).toMatch(/green/);
  });

  it("colors in_progress tasks amber", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={{ ...baseTask, status: "in_progress" }}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByTestId("gantt-task-bar").className).toMatch(/amber/);
  });

  it("colors todo tasks gray", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={{ ...baseTask, status: "todo" }}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByTestId("gantt-task-bar").className).toMatch(/gray/);
  });

  it("bar has draggable=true", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={baseTask}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByTestId("gantt-task-bar")).toHaveAttribute("draggable", "true");
  });

  it("dragStart handler fires without throwing", async () => {
    // Pixel-level drag-drop rescheduling is an e2e concern; here we just verify
    // the handler is wired and does not throw when invoked.
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={baseTask}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(() =>
      fireEvent.dragStart(screen.getByTestId("gantt-task-bar"))
    ).not.toThrow();
  });

  it("shows Dutch date tooltip on bar", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={baseTask}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.getByTestId("gantt-task-bar")).toHaveAttribute(
      "title",
      expect.stringMatching(/01-01-2025/)
    );
  });

  it("applies red border when isCritical=true", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={baseTask}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
        isCritical
      />
    );
    expect(screen.getByTestId("gantt-task-bar").className).toMatch(/border-red/);
  });

  it("renders no-date placeholder when task has no start_date", async () => {
    const { GanttRow } = await import("@/components/gantt/GanttRow");
    render(
      <GanttRow
        task={{ ...baseTask, start_date: null, end_date: null }}
        chartStart={chartStart}
        dayWidthPx={dayWidthPx}
        onReschedule={vi.fn()}
      />
    );
    expect(screen.queryByTestId("gantt-task-bar")).not.toBeInTheDocument();
    expect(screen.getByTestId("gantt-no-date")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GanttChart
// ---------------------------------------------------------------------------

describe("GanttChart", () => {
  it("renders phase group headers", async () => {
    const { GanttChart } = await import("@/components/gantt/GanttChart");
    render(<GanttChart project={mockProject as any} onReschedule={vi.fn()} />);

    expect(screen.getAllByText("Fundering").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ruwbouw").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a bar for every task", async () => {
    const { GanttChart } = await import("@/components/gantt/GanttChart");
    render(<GanttChart project={mockProject as any} onReschedule={vi.fn()} />);

    expect(screen.getAllByTestId("gantt-task-bar").length).toBe(3);
  });

  it("shows the today line when today is within chart range", async () => {
    // mockProject dates span today by construction (offsetIso-based)
    const { GanttChart } = await import("@/components/gantt/GanttChart");
    render(<GanttChart project={mockProject as any} onReschedule={vi.fn()} />);

    expect(screen.getByTestId("gantt-today-line")).toBeInTheDocument();
  });

  it("dragStart on a bar does not throw", async () => {
    const { GanttChart } = await import("@/components/gantt/GanttChart");
    render(<GanttChart project={mockProject as any} onReschedule={vi.fn()} />);

    const bars = screen.getAllByTestId("gantt-task-bar");
    expect(() => fireEvent.dragStart(bars[0])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GanttPage
// ---------------------------------------------------------------------------

describe("GanttPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockImplementationOnce(() => new Promise(() => {}));

    const { default: GanttPage } = await import(
      "@/app/dashboard/projects/[id]/gantt/page"
    );
    render(<GanttPage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders the project name after loading", async () => {
    const { default: GanttPage } = await import(
      "@/app/dashboard/projects/[id]/gantt/page"
    );
    render(<GanttPage />);

    await waitFor(() => {
      expect(screen.getByText("Kantoorgebouw Amsterdam")).toBeInTheDocument();
    });
  });

  it("renders phase headers and task bars", async () => {
    const { default: GanttPage } = await import(
      "@/app/dashboard/projects/[id]/gantt/page"
    );
    render(<GanttPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Fundering").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Grondwerk").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId("gantt-task-bar").length).toBe(3);
    });
  });

  it("has a back link to the project detail page", async () => {
    const { default: GanttPage } = await import(
      "@/app/dashboard/projects/[id]/gantt/page"
    );
    render(<GanttPage />);

    await waitFor(() => {
      const backLink = screen.getByRole("link", { name: /terug/i });
      expect(backLink).toHaveAttribute("href", "/dashboard/projects/project-1");
    });
  });

  it("shows error state when project load fails", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockRejectedValueOnce(new Error("Project niet gevonden"));

    const { default: GanttPage } = await import(
      "@/app/dashboard/projects/[id]/gantt/page"
    );
    render(<GanttPage />);

    await waitFor(() => {
      expect(screen.getByText(/project niet gevonden/i)).toBeInTheDocument();
    });
  });

  it("dragStart on a bar does not throw", async () => {
    const { default: GanttPage } = await import(
      "@/app/dashboard/projects/[id]/gantt/page"
    );
    render(<GanttPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("gantt-task-bar").length).toBeGreaterThan(0);
    });

    expect(() =>
      fireEvent.dragStart(screen.getAllByTestId("gantt-task-bar")[0])
    ).not.toThrow();
  });
});
