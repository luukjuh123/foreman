import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects"),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTask = (status: "todo" | "done") => ({
  id: `task-${status}-${Math.random()}`,
  phase_id: "ph-1",
  name: `Taak ${status}`,
  status,
  priority: 1,
  estimated_hours: 4,
  labor_cost_cents: null,
});

const makePhase = () => ({
  id: "ph-1",
  project_id: "p-1",
  name: "Fundering",
  description: "",
  order_index: 0,
  status: "active",
  tasks: [makeTask("done"), makeTask("todo")],
});

const makeProject = (overrides: Partial<{
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  budget_cents: number | null;
  start_date: string | null;
  end_date: string | null;
}> = {}) => ({
  id: overrides.id ?? "proj-1",
  owner_id: "user-1",
  name: overrides.name ?? "Nieuwbouw Pand A",
  description: "Testomschrijving",
  status: overrides.status ?? "active",
  start_date: overrides.start_date ?? "2024-01-15",
  end_date: overrides.end_date ?? "2024-12-31",
  budget_cents: overrides.budget_cents ?? 5000000,
  phases: [makePhase()],
});

const makeListResponse = (projects: ReturnType<typeof makeProject>[]) => ({
  data: projects,
  total: projects.length,
  page: 1,
  per_page: 50,
});

// ---------------------------------------------------------------------------
// Tests: new features added by the redesign
// ---------------------------------------------------------------------------

describe("ProjectsPage redesign — search by name", () => {
  beforeEach(() => vi.resetModules());

  it("renders a search input", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/zoek/i)).toBeInTheDocument();
    });
  });

  it("filters projects by name when typing in search", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(
      makeListResponse([
        makeProject({ id: "p1", name: "Nieuwbouw Pand A" }),
        makeProject({ id: "p2", name: "Renovatie Villa B" }),
      ])
    );

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => screen.getByText("Nieuwbouw Pand A"));

    fireEvent.change(screen.getByPlaceholderText(/zoek/i), {
      target: { value: "renovatie" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Nieuwbouw Pand A")).not.toBeInTheDocument();
      expect(screen.getByText("Renovatie Villa B")).toBeInTheDocument();
    });
  });

  it("shows all projects when search is cleared", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(
      makeListResponse([
        makeProject({ id: "p1", name: "Alpha" }),
        makeProject({ id: "p2", name: "Beta" }),
      ])
    );

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => screen.getByText("Alpha"));

    const input = screen.getByPlaceholderText(/zoek/i);
    fireEvent.change(input, { target: { value: "beta" } });

    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument());

    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
  });
});

describe("ProjectsPage redesign — skeleton loading", () => {
  beforeEach(() => vi.resetModules());

  it("shows skeleton loading indicators while fetching", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockReturnValue(new Promise(() => {}));

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    // Skeleton is shown while loading — look for animate-pulse elements
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe("ProjectsPage redesign — empty state", () => {
  beforeEach(() => vi.resetModules());

  it("shows empty state when no projects after filtering", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/geen projecten/i)).toBeInTheDocument();
    });
  });
});

describe("ProjectsPage redesign — page header", () => {
  beforeEach(() => vi.resetModules());

  it("renders PageHeader with title Projecten", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /projecten/i })).toBeInTheDocument();
    });
  });

  it("renders Nieuw Project button", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /nieuw project/i })).toBeInTheDocument();
    });
  });
});

describe("ProjectsPage redesign — status filter select", () => {
  beforeEach(() => vi.resetModules());

  it("renders status filter", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(
      makeListResponse([makeProject({ status: "active" })])
    );

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    // The filter buttons (Alle, Actief, etc.) must still be present
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /alle/i })).toBeInTheDocument();
    });
  });
});

describe("ProjectsPage redesign — budget display", () => {
  beforeEach(() => vi.resetModules());

  it("renders formatted budget on project card", async () => {
    const { listProjects } = await import("@/lib/projects");
    vi.mocked(listProjects).mockResolvedValue(
      makeListResponse([makeProject({ budget_cents: 5000000 })])
    );

    const { default: Page } = await import("@/app/dashboard/projects/page");
    render(<Page />);

    await waitFor(() => {
      // €50.000,00 in Dutch format
      const budgetEls = screen.getAllByText(/50\.000/);
      expect(budgetEls.length).toBeGreaterThan(0);
    });
  });
});
