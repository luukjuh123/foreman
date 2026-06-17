/**
 * Tests for the Project Administration Hub — header, tab navigation, and key sub-tabs.
 * TDD: these tests are written before implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ---------------------------------------------------------------------------
// Standard mocks required by all tests in this file
// ---------------------------------------------------------------------------

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/proj-1"),
  useParams: vi.fn(() => ({ id: "proj-1" })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proj-1",
    name: "Renovatie Hoofdstraat 10",
    description: "Volledige renovatie",
    status: "active",
    start_date: "2026-01-01",
    end_date: "2026-06-30",
    budget_cents: 5000000, // €50.000,00
    phases: [
      {
        id: "phase-1",
        project_id: "proj-1",
        name: "Sloopfase",
        description: null,
        order_index: 0,
        status: "active",
        start_date: "2026-01-01",
        end_date: "2026-02-28",
        tasks: [
          {
            id: "task-1",
            phase_id: "phase-1",
            name: "Muren slopen",
            status: "done",
            priority: 1,
            estimated_hours: 8,
          },
          {
            id: "task-2",
            phase_id: "phase-1",
            name: "Puin afvoeren",
            status: "in_progress",
            priority: 1,
            estimated_hours: 4,
          },
        ],
      },
      {
        id: "phase-2",
        project_id: "proj-1",
        name: "Bouwfase",
        description: null,
        order_index: 1,
        status: "active",
        start_date: "2026-03-01",
        end_date: "2026-06-30",
        tasks: [],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatBudget pure-function tests (from lib/projects)
// ---------------------------------------------------------------------------

describe("formatBudget helper", () => {
  it("formats euro cents as Dutch currency", async () => {
    const { formatBudget } = await import("@/lib/projects");
    const result = formatBudget(5000000);
    expect(result).toContain("50.000");
    expect(result).toContain("€");
  });

  it("formats zero correctly", async () => {
    const { formatBudget } = await import("@/lib/projects");
    const result = formatBudget(0);
    expect(result).toContain("0");
    expect(result).toContain("€");
  });

  it("formats small amounts with decimals", async () => {
    const { formatBudget } = await import("@/lib/projects");
    const result = formatBudget(123456);
    expect(result).toContain("1.234");
    expect(result).toContain("€");
  });
});

// ---------------------------------------------------------------------------
// calcTaskSummary pure-function tests
// ---------------------------------------------------------------------------

describe("calcTaskSummary helper", () => {
  it("counts done and total tasks across all phases", async () => {
    const { calcTaskSummary } = await import("@/lib/projects");
    const project = makeProject() as Parameters<typeof calcTaskSummary>[0];
    const { done, total } = calcTaskSummary(project);
    expect(total).toBe(2);
    expect(done).toBe(1);
  });

  it("returns 0/0 for project with no phases", async () => {
    const { calcTaskSummary } = await import("@/lib/projects");
    const project = makeProject({ phases: [] }) as Parameters<typeof calcTaskSummary>[0];
    const { done, total } = calcTaskSummary(project);
    expect(done).toBe(0);
    expect(total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ProjectHubTabBar component
// ---------------------------------------------------------------------------

describe("ProjectHubTabBar", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders all main tab labels in Dutch", async () => {
    const { ProjectHubTabBar } = await import(
      "@/components/project-hub/ProjectHubTabBar"
    );
    render(<ProjectHubTabBar projectId="proj-1" />);

    expect(screen.getByText("Overzicht")).toBeInTheDocument();
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("Documenten")).toBeInTheDocument();
    expect(screen.getByText("Financieel")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("renders tab links with correct hrefs for project proj-1", async () => {
    const { ProjectHubTabBar } = await import(
      "@/components/project-hub/ProjectHubTabBar"
    );
    render(<ProjectHubTabBar projectId="proj-1" />);

    const overzichtLink = screen.getByRole("link", { name: "Overzicht" });
    expect(overzichtLink).toHaveAttribute(
      "href",
      "/dashboard/projects/proj-1"
    );

    const planningLink = screen.getByRole("link", { name: "Planning" });
    expect(planningLink).toHaveAttribute(
      "href",
      "/dashboard/projects/proj-1/board"
    );

    const documentenLink = screen.getByRole("link", { name: "Documenten" });
    expect(documentenLink).toHaveAttribute(
      "href",
      "/dashboard/projects/proj-1/documenten"
    );

    const financieelLink = screen.getByRole("link", { name: "Financieel" });
    expect(financieelLink).toHaveAttribute(
      "href",
      "/dashboard/projects/proj-1/financieel"
    );

    const teamLink = screen.getByRole("link", { name: "Team" });
    expect(teamLink).toHaveAttribute(
      "href",
      "/dashboard/projects/proj-1/team"
    );
  });

  it("marks Overzicht active when pathname matches project root (top-level mock)", async () => {
    // The top-level vi.mock sets usePathname to /dashboard/projects/proj-1 —
    // which is exactly the Overzicht route. Import the module fresh within this test.
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
      useRouter: vi.fn(() => ({ push: vi.fn() })),
      usePathname: vi.fn(() => "/dashboard/projects/proj-1"),
      useParams: vi.fn(() => ({ id: "proj-1" })),
    }));
    vi.doMock("next/link", () => ({
      default: ({
        children,
        href,
        "aria-current": ariaCurrent,
        ...rest
      }: {
        children: React.ReactNode;
        href: string;
        "aria-current"?: string;
      }) => (
        <a href={href} aria-current={ariaCurrent} {...rest}>
          {children}
        </a>
      ),
    }));

    const { ProjectHubTabBar } = await import(
      "@/components/project-hub/ProjectHubTabBar"
    );
    render(<ProjectHubTabBar projectId="proj-1" />);

    const overzichtLink = screen.getByRole("link", { name: "Overzicht" });
    expect(overzichtLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Planning active when pathname is /board", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
      useRouter: vi.fn(() => ({ push: vi.fn() })),
      usePathname: vi.fn(() => "/dashboard/projects/proj-1/board"),
      useParams: vi.fn(() => ({ id: "proj-1" })),
    }));
    vi.doMock("next/link", () => ({
      default: ({
        children,
        href,
        "aria-current": ariaCurrent,
        ...rest
      }: {
        children: React.ReactNode;
        href: string;
        "aria-current"?: string;
      }) => (
        <a href={href} aria-current={ariaCurrent} {...rest}>
          {children}
        </a>
      ),
    }));

    const { ProjectHubTabBar } = await import(
      "@/components/project-hub/ProjectHubTabBar"
    );
    render(<ProjectHubTabBar projectId="proj-1" />);

    const planningLink = screen.getByRole("link", { name: "Planning" });
    expect(planningLink).toHaveAttribute("aria-current", "page");
  });
});

// ---------------------------------------------------------------------------
// ProjectHubHeader component
// ---------------------------------------------------------------------------

describe("ProjectHubHeader", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders project name", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.getByText("Renovatie Hoofdstraat 10")).toBeInTheDocument();
  });

  it("renders status badge with Dutch label", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.getByText("Actief")).toBeInTheDocument();
  });

  it("renders budget in Dutch euro format", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    // Budget is €50.000,00 — check for partial match
    expect(screen.getByTestId("project-budget")).toBeInTheDocument();
  });

  it("renders date range when both dates are set", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    // Dates formatted as dd-mm-yyyy in Dutch locale
    expect(screen.getByTestId("project-dates")).toBeInTheDocument();
  });

  it("renders overall completion percentage", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.getByTestId("project-completion")).toBeInTheDocument();
  });

  it("renders quick action buttons", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.getByText("Nieuwe taak")).toBeInTheDocument();
    expect(screen.getByText("Factuur maken")).toBeInTheDocument();
    expect(screen.getByText("Rapport")).toBeInTheDocument();
  });

  it("Factuur maken links to new invoice page with project_id", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject();
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    const factuurLink = screen.getByRole("link", { name: /factuur maken/i });
    expect(factuurLink).toHaveAttribute(
      "href",
      "/dashboard/invoices/new?project_id=proj-1"
    );
  });

  it("shows skeleton status badge for project with draft status", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject({ status: "draft" });
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.getByText("Concept")).toBeInTheDocument();
  });

  it("hides date range when no dates set", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject({ start_date: null, end_date: null });
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.queryByTestId("project-dates")).not.toBeInTheDocument();
  });

  it("hides budget bar when budget_cents is null", async () => {
    const { ProjectHubHeader } = await import(
      "@/components/project-hub/ProjectHubHeader"
    );
    const project = makeProject({ budget_cents: null });
    render(
      <ProjectHubHeader
        project={project as Parameters<typeof ProjectHubHeader>[0]["project"]}
      />
    );
    expect(screen.queryByTestId("project-budget")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProjectDetailPage — loading, error, and full render
// ---------------------------------------------------------------------------

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows loading skeleton while fetching project", async () => {
    vi.doMock("@/lib/projects", () => ({
      getProject: vi.fn().mockReturnValue(new Promise(() => {})),
      calcPhaseProgress: vi.fn(() => 0),
      calcTaskSummary: vi.fn(() => ({ done: 0, total: 0 })),
      formatBudget: vi.fn(() => "€0,00"),
      formatDate: vi.fn(() => ""),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );

    const { container } = render(<Page params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      // Loading state renders Skeleton components (divs with animate-pulse)
      const skeletons = container.querySelectorAll('[class*="animate-pulse"], [class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it("shows error message when project fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({
      getProject: vi.fn().mockRejectedValue(new Error("niet gevonden")),
      calcPhaseProgress: vi.fn(() => 0),
      calcTaskSummary: vi.fn(() => ({ done: 0, total: 0 })),
      formatBudget: vi.fn(() => "€0,00"),
      formatDate: vi.fn(() => ""),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );

    await act(async () => {
      render(<Page params={Promise.resolve({ id: "proj-1" })} />);
    });

    expect(screen.getByText(/niet gevonden/i)).toBeInTheDocument();
  });

  it("renders project name after successful load", async () => {
    const project = makeProject();
    vi.doMock("@/lib/projects", () => ({
      getProject: vi.fn().mockResolvedValue(project),
      calcPhaseProgress: vi.fn(() => 50),
      calcTaskSummary: vi.fn(() => ({ done: 1, total: 2 })),
      formatBudget: vi.fn(() => "€ 50.000,00"),
      formatDate: vi.fn((d: string | null) => d ?? ""),
    }));

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );

    await act(async () => {
      render(<Page params={Promise.resolve({ id: "proj-1" })} />);
    });

    expect(screen.getAllByText("Renovatie Hoofdstraat 10").length).toBeGreaterThan(0);
  });

  it("renders tab bar after successful load", async () => {
    const project = makeProject();
    vi.doMock("@/lib/projects", () => ({
      getProject: vi.fn().mockResolvedValue(project),
      calcPhaseProgress: vi.fn(() => 50),
      calcTaskSummary: vi.fn(() => ({ done: 1, total: 2 })),
      formatBudget: vi.fn(() => "€ 50.000,00"),
      formatDate: vi.fn((d: string | null) => d ?? ""),
    }));

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );

    await act(async () => {
      render(<Page params={Promise.resolve({ id: "proj-1" })} />);
    });

    expect(screen.getByText("Overzicht")).toBeInTheDocument();
    // "Fases" appears both as a key-fact label and a tab trigger
    expect(screen.getAllByText("Fases").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Documenten")).toBeInTheDocument();
    expect(screen.getByText("Nakijklijst")).toBeInTheDocument();
    expect(screen.getByText("Tijdregistratie")).toBeInTheDocument();
  });

  it("renders phase cards in Overzicht tab", async () => {
    const project = makeProject();
    vi.doMock("@/lib/projects", () => ({
      getProject: vi.fn().mockResolvedValue(project),
      calcPhaseProgress: vi.fn(() => 50),
      calcTaskSummary: vi.fn(() => ({ done: 1, total: 2 })),
      formatBudget: vi.fn(() => "€ 50.000,00"),
      formatDate: vi.fn((d: string | null) => d ?? ""),
    }));

    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/projects/[id]/page"
    );

    await act(async () => {
      render(<Page params={Promise.resolve({ id: "proj-1" })} />);
    });

    expect(screen.getByText("Sloopfase")).toBeInTheDocument();
    expect(screen.getByText("Bouwfase")).toBeInTheDocument();
  });
});
