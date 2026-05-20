import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/processes"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/processes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/processes")>();
  return {
    ...actual,
    listProcesses: vi.fn(),
    listProcessStats: vi.fn(),
    createProcess: vi.fn(),
    formatDuration: actual.formatDuration,
  };
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockProcess = (overrides: Partial<{
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: string;
}> = {}) => ({
  id: overrides.id ?? "proc-1",
  slug: overrides.slug ?? "fundering",
  name: overrides.name ?? "Fundering",
  description: overrides.description ?? "Funderingswerkzaamheden",
  unit: overrides.unit ?? "m2",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const mockStat = (processId = "proc-1", slug = "fundering", name = "Fundering") => ({
  process_id: processId,
  process_slug: slug,
  process_name: name,
  entry_count: 5,
  project_count: 3,
  total_seconds: 18000,
  avg_seconds: 3600,
});

const mockListResponse = {
  data: [
    mockProcess({ id: "proc-1", slug: "fundering", name: "Fundering" }),
    mockProcess({ id: "proc-2", slug: "metselwerk", name: "Metselwerk", unit: "m3" }),
  ],
  total: 2,
};

const mockStatsResponse = {
  data: [
    mockStat("proc-1", "fundering", "Fundering"),
    mockStat("proc-2", "metselwerk", "Metselwerk"),
  ],
};

// ---------------------------------------------------------------------------
// Unit: formatDuration helper
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats null as —", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(null)).toBe("—");
  });

  it("formats 0 seconds as 0 u 0 min", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(0)).toBe("0 u 0 min");
  });

  it("formats 3600 seconds as 1 u 0 min", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(3600)).toBe("1 u 0 min");
  });

  it("formats 5400 seconds as 1 u 30 min", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(5400)).toBe("1 u 30 min");
  });

  it("formats 90 seconds as 0 u 1 min", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(90)).toBe("0 u 1 min");
  });
});

// ---------------------------------------------------------------------------
// ProcessesPage — renders loading state initially
// ---------------------------------------------------------------------------

describe("ProcessesPage loading state", () => {
  beforeEach(async () => {
    const { listProcesses, listProcessStats } = await import("@/lib/processes");
    // Never resolves — keeps page in loading state
    vi.mocked(listProcesses).mockReturnValue(new Promise(() => {}));
    vi.mocked(listProcessStats).mockReturnValue(new Promise(() => {}));
  });

  it("renders Processen heading", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);
    expect(screen.getByText("Processen")).toBeInTheDocument();
  });

  it("renders Nieuw proces button", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);
    expect(screen.getByRole("button", { name: /nieuw proces/i })).toBeInTheDocument();
  });

  it("shows loading skeleton while fetching", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);
    expect(screen.getByTestId("processes-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProcessesPage — renders process list after loading
// ---------------------------------------------------------------------------

describe("ProcessesPage process list", () => {
  beforeEach(async () => {
    const { listProcesses, listProcessStats } = await import("@/lib/processes");
    vi.mocked(listProcesses).mockResolvedValue(mockListResponse);
    vi.mocked(listProcessStats).mockResolvedValue(mockStatsResponse);
  });

  it("renders process names after loading", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      expect(screen.getByText("Fundering")).toBeInTheDocument();
      expect(screen.getByText("Metselwerk")).toBeInTheDocument();
    });
  });

  it("renders process unit labels", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("m2").length).toBeGreaterThan(0);
    });
  });

  it("renders process descriptions", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Funderingswerkzaamheden").length).toBeGreaterThan(0);
    });
  });

  it("shows total process count", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      expect(screen.getByText(/2 processen/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ProcessesPage — shows stats per process
// ---------------------------------------------------------------------------

describe("ProcessesPage stats", () => {
  beforeEach(async () => {
    const { listProcesses, listProcessStats } = await import("@/lib/processes");
    vi.mocked(listProcesses).mockResolvedValue(mockListResponse);
    vi.mocked(listProcessStats).mockResolvedValue(mockStatsResponse);
  });

  it("shows formatted avg duration for a process", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      // avg_seconds = 3600 → "1 u 0 min"
      expect(screen.getAllByText("1 u 0 min").length).toBeGreaterThan(0);
    });
  });

  it("shows project count for a process", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      // project_count = 3
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ProcessesPage — create process form
// ---------------------------------------------------------------------------

describe("ProcessesPage create form", () => {
  beforeEach(async () => {
    const { listProcesses, listProcessStats, createProcess } = await import("@/lib/processes");
    vi.mocked(listProcesses).mockResolvedValue(mockListResponse);
    vi.mocked(listProcessStats).mockResolvedValue(mockStatsResponse);
    vi.mocked(createProcess).mockResolvedValue(
      mockProcess({ id: "proc-3", slug: "nieuw-proces", name: "Nieuw Proces" })
    );
  });

  it("opens create form when Nieuw proces button is clicked", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    fireEvent.click(screen.getByRole("button", { name: /nieuw proces/i }));

    await waitFor(() => {
      expect(screen.getByTestId("create-process-form")).toBeInTheDocument();
    });
  });

  it("submits create form with correct data", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    const { createProcess } = await import("@/lib/processes");

    render(<ProcessesPage />);
    fireEvent.click(screen.getByRole("button", { name: /nieuw proces/i }));

    await waitFor(() => screen.getByTestId("create-process-form"));

    fireEvent.change(screen.getByLabelText(/naam/i), { target: { value: "Nieuw Proces" } });
    fireEvent.change(screen.getByLabelText(/slug/i), { target: { value: "nieuw-proces" } });
    fireEvent.change(screen.getByLabelText(/eenheid/i), { target: { value: "m2" } });

    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(vi.mocked(createProcess)).toHaveBeenCalledWith({
        name: "Nieuw Proces",
        slug: "nieuw-proces",
        unit: "m2",
        description: "",
      });
    });
  });

  it("closes form after successful creation", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    fireEvent.click(screen.getByRole("button", { name: /nieuw proces/i }));
    await waitFor(() => screen.getByTestId("create-process-form"));

    fireEvent.change(screen.getByLabelText(/naam/i), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/slug/i), { target: { value: "test" } });
    fireEvent.change(screen.getByLabelText(/eenheid/i), { target: { value: "m2" } });
    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("create-process-form")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ProcessesPage — error state
// ---------------------------------------------------------------------------

describe("ProcessesPage error state", () => {
  beforeEach(async () => {
    const { listProcesses, listProcessStats } = await import("@/lib/processes");
    vi.mocked(listProcesses).mockRejectedValue(new Error("API onbereikbaar"));
    vi.mocked(listProcessStats).mockRejectedValue(new Error("API onbereikbaar"));
  });

  it("shows error message on API failure", async () => {
    const { default: ProcessesPage } = await import("@/app/dashboard/processes/page");
    render(<ProcessesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("processes-error")).toBeInTheDocument();
    });
  });
});
