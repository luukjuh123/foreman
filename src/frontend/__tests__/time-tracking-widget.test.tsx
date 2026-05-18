import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/proj-1/time-tracking"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

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

const makeProjectProcess = (overrides: Partial<{ id: string; name: string }> = {}) => ({
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
    updated_at: "2026-01-01T00:00:00Z",
  },
});

// ---------------------------------------------------------------------------
// Unit: formatDuration helper
// ---------------------------------------------------------------------------

describe("formatDuration (time-tracking)", () => {
  it("formats zero seconds as 0:00", async () => {
    const { formatDuration } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats 59 seconds as 0:59", async () => {
    const { formatDuration } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    expect(formatDuration(59)).toBe("0:59");
  });

  it("formats 90 seconds as 1:30", async () => {
    const { formatDuration } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    expect(formatDuration(90)).toBe("1:30");
  });

  it("formats 3600 seconds as 1:00:00", async () => {
    const { formatDuration } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  it("formats 3661 seconds as 1:01:01", async () => {
    const { formatDuration } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("formats 7322 seconds as 2:02:02", async () => {
    const { formatDuration } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    expect(formatDuration(7322)).toBe("2:02:02");
  });
});

// ---------------------------------------------------------------------------
// TimeTracker component
// ---------------------------------------------------------------------------

describe("TimeTracker component", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders the process name", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total_seconds: 0 });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => {
      expect(screen.getByText("Stucen")).toBeInTheDocument();
    });
  });

  it("shows Start button when no timer is running", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total_seconds: 0 });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    });
  });

  it("calls start API and shows Stop button after clicking Start", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });

    // Stateful mock: after start is called, GET returns a running entry
    let started = false;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/start")) {
        started = true;
        return runningEntry;
      }
      // GET /time-tracking/pp-1
      if (started) {
        return { data: [runningEntry], total_seconds: 0 };
      }
      return { data: [], total_seconds: 0 };
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => screen.getByRole("button", { name: /start/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    });
  });

  it("calls POST /time-tracking/pp-1/start when Start is clicked", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    let started = false;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/start")) { started = true; return runningEntry; }
      return { data: started ? [runningEntry] : [], total_seconds: 0 };
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => screen.getByRole("button", { name: /start/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start/i }));
    });

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        expect.stringContaining("/time-tracking/pp-1/start"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls POST /time-tracking/pp-1/stop when Stop is clicked", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    const stoppedEntry = makeEntry({ duration_seconds: 60 });
    let state: "idle" | "running" | "stopped" = "running"; // start pre-running

    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/stop")) { state = "stopped"; return stoppedEntry; }
      if (state === "running") return { data: [runningEntry], total_seconds: 0 };
      return { data: [stoppedEntry], total_seconds: 60 };
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => screen.getByRole("button", { name: /stop/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    });

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        expect.stringContaining("/time-tracking/pp-1/stop"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows Stop button when a running entry is loaded", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    vi.mocked(apiFetch).mockResolvedValue({
      data: [runningEntry],
      total_seconds: 0,
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    });
  });

  it("shows entry in history after stopping", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    const stoppedEntry = makeEntry({ duration_seconds: 1800 });
    let state: "idle" | "running" | "stopped" = "running";

    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/stop")) { state = "stopped"; return stoppedEntry; }
      if (state === "running") return { data: [runningEntry], total_seconds: 0 };
      return { data: [stoppedEntry], total_seconds: 1800 };
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => screen.getByRole("button", { name: /stop/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    });

    await waitFor(() => {
      // 1800s = 30:00 — may appear in both total and history list
      expect(screen.getAllByText("30:00").length).toBeGreaterThan(0);
    });
  });

  it("shows total time tracked", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({
      data: [makeEntry({ duration_seconds: 3600 })],
      total_seconds: 3600,
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => {
      expect(screen.getByText(/totale tijd/i)).toBeInTheDocument();
      // total_seconds 3600 → 1:00:00 (may also appear in history)
      expect(screen.getAllByText("1:00:00").length).toBeGreaterThan(0);
    });
  });

  it("shows notes input", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [], total_seconds: 0 });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/opmerkingen/i)).toBeInTheDocument();
    });
  });

  it("sends notes in start API call", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    let started = false;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/start")) { started = true; return runningEntry; }
      return { data: started ? [runningEntry] : [], total_seconds: 0 };
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    await waitFor(() => screen.getByPlaceholderText(/opmerkingen/i));
    fireEvent.change(screen.getByPlaceholderText(/opmerkingen/i), {
      target: { value: "Muur A klaar" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start/i }));
    });

    await waitFor(() => {
      const calls = vi.mocked(apiFetch).mock.calls;
      const startCall = calls.find(([p]) => (p as string).includes("/start"));
      expect(startCall).toBeDefined();
      const body = JSON.parse((startCall![1] as { body: string }).body);
      expect(body.notes).toBe("Muur A klaar");
    });
  });

  it("calls onUpdate callback after start", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    let started = false;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/start")) { started = true; return runningEntry; }
      return { data: started ? [runningEntry] : [], total_seconds: 0 };
    });

    const onUpdate = vi.fn();
    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );
    render(
      <TimeTracker
        projectProcessId="pp-1"
        processName="Stucen"
        onUpdate={onUpdate}
      />
    );

    await waitFor(() => screen.getByRole("button", { name: /start/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start/i }));
    });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// TimeTracker live timer (isolated fake timers test)
// ---------------------------------------------------------------------------

describe("TimeTracker live timer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("live timer ticks every second when running", async () => {
    const { apiFetch } = await import("@/lib/api");
    const runningEntry = makeEntry({ stopped_at: null, duration_seconds: null });
    let started = false;

    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      const p = path as string;
      if (p.includes("/start")) { started = true; return runningEntry; }
      return { data: started ? [runningEntry] : [], total_seconds: 0 };
    });

    const { default: TimeTracker } = await import(
      "@/components/time-tracking/TimeTracker"
    );

    render(<TimeTracker projectProcessId="pp-1" processName="Stucen" />);

    // Wait for initial load with real timers
    await waitFor(() => screen.getByRole("button", { name: /start/i }));

    // Switch to fake timers before triggering state change
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    // Flush all promises (the start + loadEntries calls)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Advance 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("0:03")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Time tracking page
// ---------------------------------------------------------------------------

describe("TimeTrackingPage", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders Tijdregistratie heading", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if ((path as string).includes("/processes/projects/")) {
        return { data: [makeProjectProcess({ id: "pp-1", name: "Stucen" })] };
      }
      return { data: [], total_seconds: 0 };
    });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/tijdregistratie/i)).toBeInTheDocument();
    });
  });

  it("renders a card for each project process", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if ((path as string).includes("/processes/projects/")) {
        return {
          data: [
            makeProjectProcess({ id: "pp-1", name: "Stucen" }),
            makeProjectProcess({ id: "pp-2", name: "Tegelen" }),
          ],
        };
      }
      return { data: [], total_seconds: 0 };
    });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Stucen")).toBeInTheDocument();
      expect(screen.getByText("Tegelen")).toBeInTheDocument();
    });
  });

  it("shows back button linking to project detail", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if ((path as string).includes("/processes/projects/")) {
        return { data: [] };
      }
      return { data: [], total_seconds: 0 };
    });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const back = links.find((l) =>
        l.getAttribute("href")?.includes("/dashboard/projects/proj-1")
      );
      expect(back).toBeInTheDocument();
    });
  });

  it("shows empty state when no processes", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if ((path as string).includes("/processes/projects/")) {
        return { data: [] };
      }
      return { data: [], total_seconds: 0 };
    });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/geen processen gekoppeld/i)).toBeInTheDocument();
    });
  });

  it("shows loading state initially", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});
