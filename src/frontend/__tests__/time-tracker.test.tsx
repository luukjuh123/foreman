import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/proj-1"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/time-tracking", () => ({
  listProjectProcesses: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  listTimeEntries: vi.fn(),
}));

vi.mock("@/lib/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects")>();
  return {
    ...actual,
    listProjects: vi.fn(),
    getProject: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeEntry = (overrides: Partial<{
  id: string;
  stopped_at: string | null;
  duration_seconds: number | null;
}> = {}) => ({
  id: overrides.id ?? "entry-1",
  project_process_id: "pp-1",
  started_at: "2026-01-01T10:00:00Z",
  stopped_at: overrides.stopped_at !== undefined ? overrides.stopped_at : "2026-01-01T10:30:00Z",
  duration_seconds: overrides.duration_seconds !== undefined ? overrides.duration_seconds : 1800,
  notes: null,
  created_at: "2026-01-01T10:00:00Z",
});

const makeProcess = (overrides: Partial<{ id: string; name: string }> = {}) => ({
  id: overrides.id ?? "pp-1",
  project_id: "proj-1",
  process_id: "proc-1",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  process: {
    id: "proc-1",
    slug: "stucen",
    name: overrides.name ?? "Stucen",
    description: "Stucwerk aanbrengen",
    unit: "m2",
    created_at: "2026-01-01T00:00:00Z",
  },
});

// ---------------------------------------------------------------------------
// TimeTracker component tests (real timers)
// ---------------------------------------------------------------------------

describe("TimeTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders process list with start buttons", async () => {
    const { listProjectProcesses, listTimeEntries } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" }), makeProcess({ id: "pp-2", name: "Schilderen" })],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText("Stucen")).toBeInTheDocument();
      expect(screen.getByText("Schilderen")).toBeInTheDocument();
    });

    const startButtons = screen.getAllByRole("button", { name: /starten/i });
    expect(startButtons).toHaveLength(2);
  });

  it("renders section heading Tijdregistratie", async () => {
    const { listProjectProcesses, listTimeEntries } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess()],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText("Tijdregistratie")).toBeInTheDocument();
    });
  });

  it("shows empty state when no processes", async () => {
    const { listProjectProcesses } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({ data: [] });

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/geen processen/i)).toBeInTheDocument();
    });
  });

  it("clicking start calls startTimer and shows stop button", async () => {
    const { listProjectProcesses, listTimeEntries, startTimer } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" })],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });
    vi.mocked(startTimer).mockResolvedValue(makeEntry({ stopped_at: null, duration_seconds: null }));

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => screen.getByRole("button", { name: /starten/i }));
    fireEvent.click(screen.getByRole("button", { name: /starten/i }));

    await waitFor(() => {
      expect(startTimer).toHaveBeenCalledWith("pp-1", undefined);
      expect(screen.getByRole("button", { name: /stoppen/i })).toBeInTheDocument();
    });
  });

  it("clicking stop shows notes input and submits on confirm", async () => {
    const { listProjectProcesses, listTimeEntries, startTimer, stopTimer } = await import(
      "@/lib/time-tracking"
    );
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" })],
    });
    vi.mocked(listTimeEntries)
      .mockResolvedValueOnce({ data: [], total_seconds: 0 })
      .mockResolvedValue({ data: [makeEntry()], total_seconds: 1800 });
    vi.mocked(startTimer).mockResolvedValue(makeEntry({ stopped_at: null, duration_seconds: null }));
    vi.mocked(stopTimer).mockResolvedValue(makeEntry({ stopped_at: "2026-01-01T10:30:00Z", duration_seconds: 1800 }));

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => screen.getByRole("button", { name: /starten/i }));
    fireEvent.click(screen.getByRole("button", { name: /starten/i }));

    await waitFor(() => screen.getByRole("button", { name: /stoppen/i }));
    fireEvent.click(screen.getByRole("button", { name: /stoppen/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/notities/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/notities/i), { target: { value: "Klaar met stucen" } });
    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(stopTimer).toHaveBeenCalledWith("pp-1", "Klaar met stucen");
    });
  });

  it("displays total logged time per process in Dutch format", async () => {
    const { listProjectProcesses, listTimeEntries } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" })],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({
      data: [makeEntry({ duration_seconds: 3900 })],
      total_seconds: 3900,
    });

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/1 u 5 min/i)).toBeInTheDocument();
    });
  });

  it("displays total of 0 min when no entries", async () => {
    const { listProjectProcesses, listTimeEntries } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" })],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/0 min/i)).toBeInTheDocument();
    });
  });

  it("shows error message when API fails to load processes", async () => {
    const { listProjectProcesses } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockRejectedValue(new Error("Netwerk fout"));

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });

  it("shows error when startTimer fails", async () => {
    const { listProjectProcesses, listTimeEntries, startTimer } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" })],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });
    vi.mocked(startTimer).mockRejectedValue(new Error("Kan timer niet starten"));

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    await waitFor(() => screen.getByRole("button", { name: /starten/i }));
    fireEvent.click(screen.getByRole("button", { name: /starten/i }));

    await waitFor(() => {
      expect(screen.getByText(/kan timer niet starten/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// TimeTracker live timer test (isolated with fake timers)
// ---------------------------------------------------------------------------

describe("TimeTracker live timer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows elapsed time updating every second after start", async () => {
    vi.useRealTimers(); // use real timers for setup then switch
    const { listProjectProcesses, listTimeEntries, startTimer } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({
      data: [makeProcess({ id: "pp-1", name: "Stucen" })],
    });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });
    vi.mocked(startTimer).mockResolvedValue(makeEntry({ stopped_at: null, duration_seconds: null }));

    const { default: TimeTracker } = await import("@/components/time-tracking/TimeTracker");
    render(<TimeTracker projectId="proj-1" />);

    // Wait for initial render with real timers
    const startBtn = await screen.findByRole("button", { name: /starten/i });

    // Switch to fake timers for controlled elapsed time testing
    vi.useFakeTimers();
    fireEvent.click(startBtn);

    // Flush startTimer promise
    await act(async () => { await Promise.resolve(); });

    // Advance 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("0:05")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// formatTotalDuration helper tests
// ---------------------------------------------------------------------------

describe("formatTotalDuration", () => {
  it("formats 0 seconds as '0 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(0)).toBe("0 min");
  });

  it("formats 60 seconds as '1 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(60)).toBe("1 min");
  });

  it("formats 3600 seconds as '1 u 0 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(3600)).toBe("1 u 0 min");
  });

  it("formats 3900 seconds as '1 u 5 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(3900)).toBe("1 u 5 min");
  });

  it("formats 7380 seconds as '2 u 3 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(7380)).toBe("2 u 3 min");
  });
});

// ---------------------------------------------------------------------------
// Project detail page integration
// ---------------------------------------------------------------------------

describe("ProjectDetailPage Tijdregistratie section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Tijdregistratie section heading on project detail page", async () => {
    const { listProjectProcesses, listTimeEntries } = await import("@/lib/time-tracking");
    vi.mocked(listProjectProcesses).mockResolvedValue({ data: [] });
    vi.mocked(listTimeEntries).mockResolvedValue({ data: [], total_seconds: 0 });

    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue({
      id: "proj-1",
      name: "Nieuwbouw Pand A",
      description: null,
      status: "active",
      start_date: null,
      end_date: null,
      budget_cents: null,
      phases: [],
    });

    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Tijdregistratie")).toBeInTheDocument();
    });
  });
});
