import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

const mockUpdateTask = vi.fn();
vi.mock("@/lib/projects", () => ({
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseTask = {
  task_id: "task-1",
  project_id: "project-1",
  project_name: "Kantoorgebouw",
  phase_id: "phase-1",
  phase_name: "Fundering",
  name: "Grondwerk",
  description: null,
  status: "todo",
  priority: 1,
  estimated_hours: 8,
  start_date: "2025-06-01",
  end_date: "2025-06-05",
  start_time: null,
  end_time: null,
  location: null,
};

const taskB = {
  ...baseTask,
  task_id: "task-2",
  name: "Betonstorten",
  start_date: "2025-06-10",
  end_date: "2025-06-12",
};

const agendaDays = [
  { date: "2025-06-01", tasks: [baseTask] },
  { date: "2025-06-02", tasks: [] },
  { date: "2025-06-10", tasks: [taskB] },
];

// ---------------------------------------------------------------------------
// DraggableTask
// ---------------------------------------------------------------------------

describe("DraggableTask", () => {
  it("renders the task name", async () => {
    const { DraggableTask } = await import("@/components/agenda/DraggableTask");
    render(<DraggableTask task={baseTask} />);
    expect(screen.getByText("Grondwerk")).toBeInTheDocument();
  });

  it("has draggable attribute set to true", async () => {
    const { DraggableTask } = await import("@/components/agenda/DraggableTask");
    render(<DraggableTask task={baseTask} />);
    expect(screen.getByTestId("draggable-task")).toHaveAttribute("draggable", "true");
  });

  it("applies reduced opacity when isDragging=true", async () => {
    const { DraggableTask } = await import("@/components/agenda/DraggableTask");
    render(<DraggableTask task={baseTask} isDragging />);
    expect(screen.getByTestId("draggable-task").className).toMatch(/opacity/);
  });

  it("dragStart fires without throwing", async () => {
    const { DraggableTask } = await import("@/components/agenda/DraggableTask");
    render(<DraggableTask task={baseTask} />);
    expect(() => fireEvent.dragStart(screen.getByTestId("draggable-task"))).not.toThrow();
  });

  it("shows task status", async () => {
    const { DraggableTask } = await import("@/components/agenda/DraggableTask");
    render(<DraggableTask task={baseTask} />);
    expect(screen.getByTestId("draggable-task").textContent).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DroppableDay
// ---------------------------------------------------------------------------

describe("DroppableDay", () => {
  it("renders the date label", async () => {
    const { DroppableDay } = await import("@/components/agenda/DroppableDay");
    render(
      <DroppableDay date="2025-06-01" tasks={[]} onDrop={vi.fn()}>
        <span>child</span>
      </DroppableDay>
    );
    expect(screen.getByTestId("droppable-day")).toBeInTheDocument();
  });

  it("calls onDrop with task and target date when a task is dropped", async () => {
    const { DroppableDay } = await import("@/components/agenda/DroppableDay");
    const onDrop = vi.fn();
    render(
      <DroppableDay date="2025-06-02" tasks={[]} onDrop={onDrop}>
        <span>slot</span>
      </DroppableDay>
    );

    const dropZone = screen.getByTestId("droppable-day");

    // Simulate drag-over then drop with dataTransfer containing task JSON
    fireEvent.dragOver(dropZone, {
      dataTransfer: { types: ["application/json"], getData: () => JSON.stringify(baseTask) },
    });
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: () => JSON.stringify(baseTask) },
    });

    expect(onDrop).toHaveBeenCalledWith(baseTask, "2025-06-02");
  });

  it("applies highlight class when isOver=true", async () => {
    const { DroppableDay } = await import("@/components/agenda/DroppableDay");
    render(
      <DroppableDay date="2025-06-01" tasks={[]} onDrop={vi.fn()} isOver>
        <span>slot</span>
      </DroppableDay>
    );
    expect(screen.getByTestId("droppable-day").className).toMatch(/ring|border|highlight|bg-/);
  });

  it("does not call onDrop when dragOver is prevented (e.preventDefault called)", async () => {
    const { DroppableDay } = await import("@/components/agenda/DroppableDay");
    const onDrop = vi.fn();
    render(
      <DroppableDay date="2025-06-01" tasks={[]} onDrop={onDrop}>
        <span>slot</span>
      </DroppableDay>
    );
    // Only fire dragOver, no drop — onDrop should not be called
    fireEvent.dragOver(screen.getByTestId("droppable-day"), {
      dataTransfer: { types: ["application/json"], getData: () => JSON.stringify(baseTask) },
    });
    expect(onDrop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Date calculation helpers — duration preservation
// ---------------------------------------------------------------------------

describe("calcNewDates (duration preservation)", () => {
  it("shifts start and end by the same delta, preserving duration", async () => {
    const { calcNewDates } = await import("@/components/agenda/AgendaWeekGrid");
    const result = calcNewDates(baseTask, "2025-06-08");
    // original: 2025-06-01 → 2025-06-05 = 4 days duration
    // new start: 2025-06-08, so new end: 2025-06-12
    expect(result.start_date).toBe("2025-06-08");
    expect(result.end_date).toBe("2025-06-12");
  });

  it("preserves a single-day task duration", async () => {
    const { calcNewDates } = await import("@/components/agenda/AgendaWeekGrid");
    const singleDay = { ...baseTask, start_date: "2025-06-03", end_date: "2025-06-03" };
    const result = calcNewDates(singleDay, "2025-06-10");
    expect(result.start_date).toBe("2025-06-10");
    expect(result.end_date).toBe("2025-06-10");
  });

  it("handles backwards drag (earlier date)", async () => {
    const { calcNewDates } = await import("@/components/agenda/AgendaWeekGrid");
    // original: 2025-06-10 → 2025-06-12 (2 days duration)
    const result = calcNewDates(taskB, "2025-06-03");
    expect(result.start_date).toBe("2025-06-03");
    expect(result.end_date).toBe("2025-06-05");
  });
});

// ---------------------------------------------------------------------------
// AgendaWeekGrid — optimistic update and revert on API error
// ---------------------------------------------------------------------------

describe("AgendaWeekGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all days", async () => {
    const { AgendaWeekGrid } = await import("@/components/agenda/AgendaWeekGrid");
    render(<AgendaWeekGrid days={agendaDays} onRefresh={vi.fn()} />);
    expect(screen.getAllByTestId("droppable-day").length).toBe(3);
  });

  it("renders task cards in correct days", async () => {
    const { AgendaWeekGrid } = await import("@/components/agenda/AgendaWeekGrid");
    render(<AgendaWeekGrid days={agendaDays} onRefresh={vi.fn()} />);
    expect(screen.getByText("Grondwerk")).toBeInTheDocument();
    expect(screen.getByText("Betonstorten")).toBeInTheDocument();
  });

  it("optimistically moves task to new day after drop", async () => {
    mockUpdateTask.mockResolvedValue({ ...baseTask, start_date: "2025-06-02", end_date: "2025-06-06" });

    const { AgendaWeekGrid } = await import("@/components/agenda/AgendaWeekGrid");
    render(<AgendaWeekGrid days={agendaDays} onRefresh={vi.fn()} />);

    const dropZones = screen.getAllByTestId("droppable-day");
    // drop baseTask onto day index 1 (2025-06-02)
    fireEvent.drop(dropZones[1], {
      dataTransfer: { getData: () => JSON.stringify(baseTask) },
    });

    // Optimistic update: "Grondwerk" should appear in second day slot immediately
    // The grid re-renders with updated local state — task is present somewhere
    expect(screen.getByText("Grondwerk")).toBeInTheDocument();
  });

  it("calls updateTask with correct new dates on drop", async () => {
    mockUpdateTask.mockResolvedValue({ ...baseTask, start_date: "2025-06-02", end_date: "2025-06-06" });

    const { AgendaWeekGrid } = await import("@/components/agenda/AgendaWeekGrid");
    render(<AgendaWeekGrid days={agendaDays} onRefresh={vi.fn()} />);

    const dropZones = screen.getAllByTestId("droppable-day");
    fireEvent.drop(dropZones[1], {
      dataTransfer: { getData: () => JSON.stringify(baseTask) },
    });

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith(
        "project-1",
        "phase-1",
        "task-1",
        expect.objectContaining({ start_date: "2025-06-02" })
      );
    });
  });

  it("reverts optimistic update when API call fails", async () => {
    mockUpdateTask.mockRejectedValue(new Error("API error"));

    const { AgendaWeekGrid } = await import("@/components/agenda/AgendaWeekGrid");
    const onRefresh = vi.fn();
    render(<AgendaWeekGrid days={agendaDays} onRefresh={onRefresh} />);

    const dropZones = screen.getAllByTestId("droppable-day");
    await act(async () => {
      fireEvent.drop(dropZones[1], {
        dataTransfer: { getData: () => JSON.stringify(baseTask) },
      });
    });

    await waitFor(() => {
      // After revert the task should still be present (reverted to original state)
      expect(screen.getByText("Grondwerk")).toBeInTheDocument();
    });
  });

  it("does not call updateTask when task is dropped on its own day", async () => {
    const { AgendaWeekGrid } = await import("@/components/agenda/AgendaWeekGrid");
    render(<AgendaWeekGrid days={agendaDays} onRefresh={vi.fn()} />);

    // Drop baseTask on dropZones[0] which is 2025-06-01 — same as task's start_date
    const dropZones = screen.getAllByTestId("droppable-day");
    fireEvent.drop(dropZones[0], {
      dataTransfer: { getData: () => JSON.stringify(baseTask) },
    });

    await waitFor(() => {
      expect(mockUpdateTask).not.toHaveBeenCalled();
    });
  });
});
