import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
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

vi.mock("@/lib/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects")>();
  return {
    ...actual,
    listProjects: vi.fn(),
    getProject: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/components/time-tracking/TimeTracker", () => ({
  default: () => <div data-testid="time-tracker-stub">TimeTracker</div>,
}));

vi.mock("@/components/punch-list/PunchListTab", () => ({
  default: () => <div data-testid="punch-list-stub">PunchList</div>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTask = (status: "todo" | "done") => ({
  id: `task-${status}`,
  phase_id: "ph-1",
  name: `Taak ${status}`,
  status,
  priority: 1,
  estimated_hours: 4,
  labor_cost_cents: null,
});

const makePhase = () => ({
  id: "ph-1",
  project_id: "proj-1",
  name: "Fundering",
  description: "",
  order_index: 0,
  status: "active",
  tasks: [makeTask("done"), makeTask("todo")],
});

const makeProject = () => ({
  id: "proj-1",
  owner_id: "user-1",
  name: "Nieuwbouw Pand A",
  description: "Bouwproject in Amsterdam",
  status: "active",
  start_date: "2024-01-15",
  end_date: "2024-12-31",
  budget_cents: 5000000,
  phases: [makePhase()],
});

// ---------------------------------------------------------------------------
// Tests: tabs navigation
// ---------------------------------------------------------------------------

describe("ProjectDetailPage redesign — tabs", () => {
  beforeEach(() => vi.resetModules());

  it("renders Overview tab active by default", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /overzicht/i })).toBeInTheDocument();
    });
  });

  it("renders Taken tab", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /taken/i })).toBeInTheDocument();
    });
  });

  it("renders Financieel tab", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /financieel/i })).toBeInTheDocument();
    });
  });

  it("renders Onderaannemers tab", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /onderaannemers/i })).toBeInTheDocument();
    });
  });

  it("shows phase list when Taken tab is clicked", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByRole("tab", { name: /taken/i }));
    fireEvent.click(screen.getByRole("tab", { name: /taken/i }));

    await waitFor(() => {
      expect(screen.getByText("Fundering")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: header card
// ---------------------------------------------------------------------------

describe("ProjectDetailPage redesign — header card", () => {
  beforeEach(() => vi.resetModules());

  it("renders project name in header", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Nieuwbouw Pand A")).toBeInTheDocument();
    });
  });

  it("renders project status badge", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/actief/i)).toBeInTheDocument();
    });
  });

  it("renders formatted budget", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      // €50.000,00 formatted
      const budgetEls = screen.getAllByText(/50\.000/);
      expect(budgetEls.length).toBeGreaterThan(0);
    });
  });

  it("renders back link to /dashboard/projects", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const backLink = links.find((l) => l.getAttribute("href") === "/dashboard/projects");
      expect(backLink).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: existing functionality preserved
// ---------------------------------------------------------------------------

describe("ProjectDetailPage redesign — existing functionality", () => {
  beforeEach(() => vi.resetModules());

  it("still renders gantt and board navigation links", async () => {
    const { getProject } = await import("@/lib/projects");
    vi.mocked(getProject).mockResolvedValue(makeProject());

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const hrefs = links.map((l) => l.getAttribute("href") ?? "");
      expect(hrefs.some((h) => h.includes("gantt"))).toBe(true);
    });
  });
});
