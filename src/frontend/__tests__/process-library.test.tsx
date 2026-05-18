import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProcesses = [
  {
    id: "proc-1",
    slug: "stucen",
    name: "Stucen",
    description: "Stucwerk aanbrengen op wanden en plafonds",
    unit: "m2",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "proc-2",
    slug: "tegelen",
    name: "Tegelen",
    description: "Tegels leggen op vloer of wand",
    unit: "m2",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

const mockStats = [
  {
    process_id: "proc-1",
    process_slug: "stucen",
    process_name: "Stucen",
    entry_count: 5,
    project_count: 3,
    total_seconds: 18000,
    avg_seconds: 3600,
  },
  {
    process_id: "proc-2",
    process_slug: "tegelen",
    process_name: "Tegelen",
    entry_count: 2,
    project_count: 1,
    total_seconds: 7200,
    avg_seconds: 3600,
  },
];

// ---------------------------------------------------------------------------
// Unit: formatDuration helper
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("returns 'Geen data' for null", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(null)).toBe("Geen data");
  });

  it("returns 'Geen data' for 0", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(0)).toBe("Geen data");
  });

  it("formats seconds under one hour as minutes", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(1800)).toBe("30min");
  });

  it("formats exactly one hour", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(3600)).toBe("1u");
  });

  it("formats hours and minutes", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(5400)).toBe("1u 30min");
  });

  it("formats multiple hours without minutes", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(7200)).toBe("2u");
  });

  it("formats multiple hours with minutes", async () => {
    const { formatDuration } = await import("@/lib/processes");
    expect(formatDuration(9000)).toBe("2u 30min");
  });
});

// ---------------------------------------------------------------------------
// ProcessLibraryPage
// ---------------------------------------------------------------------------

describe("ProcessLibraryPage", () => {
  beforeEach(async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if ((path as string).includes("/processes/stats")) {
        return { data: mockStats };
      }
      if ((path as string).includes("/processes")) {
        return { data: mockProcesses, total: 2 };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("renders Procesbibliotheek heading", async () => {
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    expect(screen.getByText("Procesbibliotheek")).toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {})); // never resolves
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    expect(screen.getByText("Laden…")).toBeInTheDocument();
  });

  it("renders process names after loading", async () => {
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("Stucen")).toBeInTheDocument();
      expect(screen.getByText("Tegelen")).toBeInTheDocument();
    });
  });

  it("renders process slugs", async () => {
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("stucen")).toBeInTheDocument();
      expect(screen.getByText("tegelen")).toBeInTheDocument();
    });
  });

  it("renders process descriptions", async () => {
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      expect(
        screen.getByText("Stucwerk aanbrengen op wanden en plafonds")
      ).toBeInTheDocument();
    });
  });

  it("renders avg duration from stats", async () => {
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      // avg_seconds = 3600 → "1u"
      const durations = screen.getAllByText("1u");
      expect(durations.length).toBeGreaterThan(0);
    });
  });

  it("renders project count from stats", async () => {
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      // proc-1 has project_count: 3
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("shows Geen data for processes without stats", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if ((path as string).includes("/processes/stats")) {
        return { data: [] }; // no stats
      }
      return { data: mockProcesses, total: 2 };
    });
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      const noData = screen.getAllByText("Geen data");
      expect(noData.length).toBeGreaterThan(0);
    });
  });

  it("shows error state when API fails", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockRejectedValue(new Error("Netwerk fout"));
    const { default: ProcessLibraryPage } = await import(
      "@/app/dashboard/processes/page"
    );
    render(<ProcessLibraryPage />);
    await waitFor(() => {
      expect(screen.getByText(/fout/i)).toBeInTheDocument();
    });
  });
});
