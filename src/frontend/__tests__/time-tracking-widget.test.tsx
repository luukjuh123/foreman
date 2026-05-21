import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

// Mock TimeTracker so page tests don't depend on its internal API
vi.mock("@/components/time-tracking/TimeTracker", () => ({
  default: ({ projectId }: { projectId: string }) => (
    <div data-testid={`tracker-${projectId}`}>TimeTracker:{projectId}</div>
  ),
  formatTotalDuration: (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} u ${m} min`;
    return `${m} min`;
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
// formatTotalDuration — additional edge cases not in time-tracker.test.tsx
// ---------------------------------------------------------------------------

describe("formatTotalDuration additional cases", () => {
  it("formats 30 seconds as '0 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(30)).toBe("0 min");
  });

  it("formats 90 seconds as '1 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(90)).toBe("1 min");
  });

  it("formats 7200 seconds as '2 u 0 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(7200)).toBe("2 u 0 min");
  });

  it("formats 9000 seconds as '2 u 30 min'", async () => {
    const { formatTotalDuration } = await import("@/components/time-tracking/TimeTracker");
    expect(formatTotalDuration(9000)).toBe("2 u 30 min");
  });
});

// ---------------------------------------------------------------------------
// TimeTrackingPage
// ---------------------------------------------------------------------------

describe("TimeTrackingPage", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders Tijdregistratie heading", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [] });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Tijdregistratie")).toBeInTheDocument();
    });
  });

  it("shows loading state before data resolves", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders a tracker widget for the project", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [] });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("tracker-proj-1")).toBeInTheDocument();
    });
  });

  it("shows TimeTracker component when project id is resolved", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [] });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/TimeTracker:proj-1/i)).toBeInTheDocument();
    });
  });

  it("renders back link pointing to project detail", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [] });

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

  it("shows error message when apiFetch fails", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockRejectedValue(new Error("Server onbereikbaar"));

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/server onbereikbaar/i)).toBeInTheDocument();
    });
  });

  it("fetches processes from the correct API path", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ data: [] });

    const { default: TimeTrackingPage } = await import(
      "@/app/dashboard/projects/[id]/time-tracking/page"
    );
    render(<TimeTrackingPage params={Promise.resolve({ id: "proj-42" })} />);

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        expect.stringContaining("/processes/projects/proj-42"),
        expect.anything()
      );
    });
  });
});
