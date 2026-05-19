import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => (key === "day" ? null : null)),
  })),
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

// Sample agenda data
const mockAgendaResponse = {
  date: "2026-05-18",
  tasks: [
    {
      task_id: "task-1",
      project_id: "proj-1",
      project_name: "Woonhuis Bakker",
      phase_id: "phase-1",
      phase_name: "Fundering",
      name: "Grondwerk uitvoeren",
      description: "Grond uitgraven voor fundering",
      status: "in_progress",
      priority: 3,
      estimated_hours: 8,
      start_date: "2026-05-18",
      end_date: "2026-05-18",
      start_time: "08:00",
      end_time: "16:00",
      location: "Bakkerstraat 12, Utrecht",
    },
    {
      task_id: "task-2",
      project_id: "proj-1",
      project_name: "Woonhuis Bakker",
      phase_id: "phase-1",
      phase_name: "Fundering",
      name: "Beton storten",
      description: null,
      status: "todo",
      priority: 2,
      estimated_hours: 4,
      start_date: "2026-05-18",
      end_date: "2026-05-18",
      start_time: null,
      end_time: null,
      location: null,
    },
    {
      task_id: "task-3",
      project_id: "proj-2",
      project_name: "Renovatie Centrum",
      phase_id: "phase-2",
      phase_name: "Ruwbouw",
      name: "Muren optrekken",
      description: "Buitenmuren bouwen",
      status: "done",
      priority: 1,
      estimated_hours: 6,
      start_date: "2026-05-18",
      end_date: "2026-05-18",
      start_time: "09:00",
      end_time: "15:00",
      location: null,
    },
    {
      task_id: "task-4",
      project_id: "proj-2",
      project_name: "Renovatie Centrum",
      phase_id: "phase-2",
      phase_name: "Ruwbouw",
      name: "Inspectie dakwerk",
      description: "Geblokkeerd door leverancier",
      status: "blocked",
      priority: 0,
      estimated_hours: 2,
      start_date: "2026-05-18",
      end_date: "2026-05-18",
      start_time: null,
      end_time: null,
      location: "Centrumplein 5, Amsterdam",
    },
  ],
};

const mockEmptyResponse = {
  date: "2026-05-19",
  tasks: [],
};

// Mock agenda lib
vi.mock("@/lib/agenda", () => ({
  fetchDayAgenda: vi.fn(() => Promise.resolve(mockAgendaResponse)),
  getProjectColor: vi.fn((projectId: string) =>
    projectId === "proj-1" ? "#3b82f6" : "#10b981"
  ),
}));

describe("AgendaDayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders date header with Dutch formatted date", async () => {
    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      // 2026-05-18 is a maandag (Monday)
      expect(screen.getByText(/maandag/i)).toBeInTheDocument();
      // Date in dd-MM-yyyy format
      expect(screen.getByText(/18-05-2026/)).toBeInTheDocument();
    });
  });

  it("renders task cards with all details", async () => {
    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      // Task names
      expect(screen.getByText("Grondwerk uitvoeren")).toBeInTheDocument();
      expect(screen.getByText("Beton storten")).toBeInTheDocument();

      // Phase name
      expect(screen.getAllByText("Fundering").length).toBeGreaterThan(0);

      // Estimated hours
      expect(screen.getByText(/8 uur/i)).toBeInTheDocument();
      expect(screen.getByText(/4 uur/i)).toBeInTheDocument();

      // Location for task-1
      expect(screen.getByText("Bakkerstraat 12, Utrecht")).toBeInTheDocument();
    });
  });

  it("groups tasks by project with project name as section header", async () => {
    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      expect(screen.getByText("Woonhuis Bakker")).toBeInTheDocument();
      expect(screen.getByText("Renovatie Centrum")).toBeInTheDocument();
    });
  });

  it("day navigation: previous day button changes the date query", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === "day" ? "2026-05-18" : null)),
    } as unknown as ReturnType<typeof useSearchParams>);

    const { fetchDayAgenda } = await import("@/lib/agenda");

    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      expect(screen.getByText(/maandag/i)).toBeInTheDocument();
    });

    const prevButton = screen.getByRole("button", { name: /vorige|prev|←|‹/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      // fetchDayAgenda should have been called with the previous day (2026-05-17)
      expect(fetchDayAgenda).toHaveBeenCalledWith("2026-05-17");
    });
  });

  it("today button resets to current date", async () => {
    const { fetchDayAgenda } = await import("@/lib/agenda");

    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /vandaag/i })).toBeInTheDocument();
    });

    const todayButton = screen.getByRole("button", { name: /vandaag/i });
    fireEvent.click(todayButton);

    // After clicking vandaag, fetchDayAgenda should be called
    await waitFor(() => {
      expect(fetchDayAgenda).toHaveBeenCalled();
    });
  });

  it("shows empty state when no tasks for the day", async () => {
    const { fetchDayAgenda } = await import("@/lib/agenda");
    vi.mocked(fetchDayAgenda).mockResolvedValueOnce(mockEmptyResponse);

    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen taken voor vandaag/i)).toBeInTheDocument();
    });
  });

  it("shows status badges with correct labels", async () => {
    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    await waitFor(() => {
      // in_progress badge
      expect(screen.getByText(/bezig/i)).toBeInTheDocument();
      // todo badge
      expect(screen.getByText(/te doen/i)).toBeInTheDocument();
      // done badge
      expect(screen.getByText(/voltooid/i)).toBeInTheDocument();
      // blocked badge
      expect(screen.getByText(/geblokkeerd/i)).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching", async () => {
    const { fetchDayAgenda } = await import("@/lib/agenda");
    vi.mocked(fetchDayAgenda).mockImplementationOnce(() => new Promise(() => {}));

    const { default: AgendaDayPage } = await import(
      "@/app/dashboard/agenda/day/page"
    );

    render(<AgendaDayPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});
