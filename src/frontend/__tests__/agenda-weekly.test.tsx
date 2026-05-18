import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Hoist mock fns so they're available inside vi.mock() factory
const { mockFetchWeekAgenda, mockGetProjectColor } = vi.hoisted(() => ({
  mockFetchWeekAgenda: vi.fn(),
  mockGetProjectColor: vi.fn(() => "#3b82f6"),
}));

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/agenda"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/agenda", () => ({
  fetchWeekAgenda: mockFetchWeekAgenda,
  getProjectColor: mockGetProjectColor,
  fetchDayAgenda: vi.fn(),
}));

// Sample agenda data helpers
const makeWeekResponse = (mondayTasks: object[] = []) => ({
  week_start: "2026-05-18",
  week_end: "2026-05-24",
  days: [
    { date: "2026-05-18", tasks: mondayTasks },
    { date: "2026-05-19", tasks: [] },
    { date: "2026-05-20", tasks: [] },
    { date: "2026-05-21", tasks: [] },
    { date: "2026-05-22", tasks: [] },
    { date: "2026-05-23", tasks: [] },
    { date: "2026-05-24", tasks: [] },
  ],
});

const mockTask = {
  task_id: "task-1",
  project_id: "proj-1",
  project_name: "Renovatie Centrum",
  phase_id: "phase-1",
  phase_name: "Fundering",
  name: "Grondwerk uitvoeren",
  description: "Grond uitgraven voor fundering",
  status: "in_progress",
  priority: 2,
  estimated_hours: 8,
  start_date: "2026-05-18",
  end_date: "2026-05-18",
  start_time: "08:00",
  end_time: "16:00",
  location: "Centrum Amsterdam",
};

import AgendaPage from "@/app/dashboard/agenda/page";

describe("AgendaWeeklyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectColor.mockReturnValue("#3b82f6");
  });

  it("renders 7 day columns with correct Dutch day names", async () => {
    mockFetchWeekAgenda.mockResolvedValue(makeWeekResponse());

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText("Ma")).toBeInTheDocument();
    expect(screen.getByText("Di")).toBeInTheDocument();
    expect(screen.getByText("Wo")).toBeInTheDocument();
    expect(screen.getByText("Do")).toBeInTheDocument();
    expect(screen.getByText("Vr")).toBeInTheDocument();
    expect(screen.getByText("Za")).toBeInTheDocument();
    expect(screen.getByText("Zo")).toBeInTheDocument();
  });

  it("renders task cards with project name and status", async () => {
    mockFetchWeekAgenda.mockResolvedValue(makeWeekResponse([mockTask]));

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
    });

    expect(screen.getByText("Renovatie Centrum")).toBeInTheDocument();
    expect(screen.getByText(/in.progress/i)).toBeInTheDocument();
    // Estimated hours rendered as "8u"
    expect(screen.getByText("8u")).toBeInTheDocument();
  });

  it("shows Vandaag button and previous/next navigation buttons", async () => {
    mockFetchWeekAgenda.mockResolvedValue(makeWeekResponse());

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("week navigation: clicking next week triggers a new fetch", async () => {
    mockFetchWeekAgenda.mockResolvedValue(makeWeekResponse());

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });

    expect(mockFetchWeekAgenda).toHaveBeenCalledTimes(1);

    const nextBtn = screen.getByRole("button", { name: /volgende week/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockFetchWeekAgenda).toHaveBeenCalledTimes(2);
    });
  });

  it("shows empty state message when no tasks for the week", async () => {
    mockFetchWeekAgenda.mockResolvedValue(makeWeekResponse());

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen taken/i)).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching", async () => {
    mockFetchWeekAgenda.mockReturnValue(new Promise(() => {}));

    render(<AgendaPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("getProjectColor (agenda lib)", () => {
  it("returns a hex color string", () => {
    const color = mockGetProjectColor("proj-abc");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("real implementation: consistent hex for same input", async () => {
    // Import the actual module bypassing the mock
    const { getProjectColor } = await vi.importActual<typeof import("@/lib/agenda")>(
      "@/lib/agenda"
    );
    const color1 = getProjectColor("proj-abc");
    const color2 = getProjectColor("proj-abc");
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("real implementation: returns valid hex for different inputs", async () => {
    const { getProjectColor } = await vi.importActual<typeof import("@/lib/agenda")>(
      "@/lib/agenda"
    );
    expect(getProjectColor("proj-aaa")).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(getProjectColor("proj-bbb")).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
