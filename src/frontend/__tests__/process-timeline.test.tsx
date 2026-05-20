import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useParams: vi.fn(() => ({ id: "project-1" })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProcesses = {
  data: [
    {
      id: "pp-1",
      project_id: "project-1",
      process_id: "proc-1",
      notes: "Fundering uitgevoerd op schema",
      created_at: "2024-03-01T09:00:00Z",
      process: {
        id: "proc-1",
        slug: "fundering",
        name: "Fundering",
        description: "Aanleggen van de fundering",
        unit: "m2",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    },
    {
      id: "pp-2",
      project_id: "project-1",
      process_id: "proc-2",
      notes: null,
      created_at: "2024-03-05T10:00:00Z",
      process: {
        id: "proc-2",
        slug: "ruwbouw",
        name: "Ruwbouw",
        description: "Optrekken van de muren",
        unit: "m3",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    },
  ],
};

const mockTimeEntries = {
  data: [
    {
      id: "te-1",
      project_process_id: "pp-1",
      started_at: "2024-03-01T08:00:00Z",
      stopped_at: "2024-03-01T10:30:00Z",
      duration_seconds: 9000,
      notes: "Ochtend shift",
      created_at: "2024-03-01T08:00:00Z",
    },
  ],
  total_seconds: 9000,
};

const mockTimeEntriesEmpty = {
  data: [],
  total_seconds: 0,
};

const mockPhotos = {
  data: [
    {
      id: "photo-1",
      project_id: "project-1",
      recognized_process_id: "proc-1",
      recognized_process_slug: "fundering",
      image_url: "https://example.com/photo1.jpg",
      completion_pct: 75,
      reasoning: "Fundering duidelijk zichtbaar",
      created_at: "2024-03-01T11:00:00Z",
    },
  ],
};

const mockPhotosEmpty = { data: [] };

// ---------------------------------------------------------------------------
// Helper: standard mock call order
// Component fetches (parallel): processes, photos
// Then (parallel per process): time-tracking/pp-1, time-tracking/pp-2
// ---------------------------------------------------------------------------

async function setupStandardMocks() {
  const { apiFetch } = await import("@/lib/api");
  vi.mocked(apiFetch)
    .mockResolvedValueOnce(mockProcesses)          // 1: /processes/projects/{id}
    .mockResolvedValueOnce(mockPhotos)             // 2: /photos/projects/{id}
    .mockResolvedValueOnce(mockTimeEntries)        // 3: /time-tracking/pp-1
    .mockResolvedValueOnce(mockTimeEntriesEmpty);  // 4: /time-tracking/pp-2
}

// ---------------------------------------------------------------------------
// Tests: ProcessTimelinePage (timeline route)
// ---------------------------------------------------------------------------

describe("ProcessTimelinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders timeline entries grouped by day", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      // Day header for 01-03-2024
      expect(screen.getByText("01-03-2024")).toBeInTheDocument();
      // Process name visible (may appear in summary + timeline)
      expect(screen.getAllByText("Fundering").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows photos with recognized process slug and completion percentage", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      // Photo thumbnail
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "https://example.com/photo1.jpg");
      // Completion percentage
      expect(screen.getByText(/75%/)).toBeInTheDocument();
      // Recognized process slug (may appear multiple times — badge + photo caption)
      expect(screen.getAllByText("fundering").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows summary card with total time per process", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      // Summary section heading
      expect(screen.getByText("Tijdlijn")).toBeInTheDocument();
      // Duration for pp-1: 9000s = 2u 30min
      expect(screen.getAllByText("2u 30min").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows empty state when no activities exist", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ data: [] })     // processes
      .mockResolvedValueOnce(mockPhotosEmpty); // photos

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/geen activiteiten/i)).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockRejectedValue(new Error("Netwerk fout"));

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/fout|netwerk/i)).toBeInTheDocument();
    });
  });

  it("shows time entry notes", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Ochtend shift")).toBeInTheDocument();
    });
  });

  it("shows duration label for time entries", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/duur/i)).toBeInTheDocument();
    });
  });

  it("renders back link to project detail", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      const backLink = screen.getByRole("link", { name: /terug/i });
      expect(backLink).toHaveAttribute("href", "/dashboard/projects/project-1");
    });
  });

  it("shows process notes", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Fundering uitgevoerd op schema")).toBeInTheDocument();
    });
  });

  it("shows process slug badges", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      // slug badge in the timeline entry (may appear multiple times due to photo caption)
      expect(screen.getAllByText("fundering").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows second day group when processes span multiple days", async () => {
    await setupStandardMocks();

    const { default: ProcessTimelinePage } = await import(
      "@/app/dashboard/projects/[id]/timeline/page"
    );

    render(<ProcessTimelinePage params={Promise.resolve({ id: "project-1" })} />);

    await waitFor(() => {
      // pp-2 was created on 2024-03-05
      expect(screen.getByText("05-03-2024")).toBeInTheDocument();
      // Ruwbouw appears in summary + timeline (multiple)
      expect(screen.getAllByText("Ruwbouw").length).toBeGreaterThanOrEqual(1);
    });
  });
});
