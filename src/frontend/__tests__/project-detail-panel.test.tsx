import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/proj-1"),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/projects", () => ({
  getProject: vi.fn(),
  calcPhaseProgress: vi.fn((phase) => {
    const done = phase.tasks.filter((t: { status: string }) => t.status === "done").length;
    return phase.tasks.length > 0 ? Math.round((done / phase.tasks.length) * 100) : 0;
  }),
  formatBudget: vi.fn((c) => `€${(c / 100).toLocaleString("nl-NL")}`),
  formatDate: vi.fn((d) => d ?? ""),
}));

// Mock documents lib
vi.mock("@/lib/documents", () => ({
  listDocuments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

// Mock apiFetch for subcontractor picker
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
}));

// Mock heavy child components
vi.mock("@/components/time-tracking/TimeTracker", () => ({
  default: () => <div data-testid="time-tracker">TimeTracker</div>,
}));
vi.mock("@/components/punch-list/PunchListTab", () => ({
  default: () => <div data-testid="punch-list">PunchList</div>,
}));

import { getProject } from "@/lib/projects";

const mockProject = {
  id: "proj-1",
  owner_id: "user-1",
  name: "Kantoorpand Rotterdam",
  description: "Renovatie van een kantoorpand",
  status: "active" as const,
  start_date: "2024-03-01",
  end_date: "2024-09-30",
  budget_cents: 750000_00,
  phases: [
    {
      id: "phase-1",
      project_id: "proj-1",
      name: "Fundering",
      description: null,
      order_index: 0,
      status: "completed",
      start_date: null,
      end_date: null,
      tasks: [
        { id: "t1", phase_id: "phase-1", name: "Grondwerk", status: "done", priority: 1, estimated_hours: 8, labor_cost_cents: null },
        { id: "t2", phase_id: "phase-1", name: "Betonstorten", status: "done", priority: 2, estimated_hours: 16, labor_cost_cents: null },
        { id: "t3", phase_id: "phase-1", name: "Waterdichting", status: "todo", priority: 3, estimated_hours: 4, labor_cost_cents: null },
      ],
    },
  ],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
};

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getProject).mockResolvedValue(mockProject);
  });

  it("renders project name in header", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);
    await waitFor(() => {
      // Name appears in both breadcrumb and h1
      const elements = screen.getAllByText("Kantoorpand Rotterdam");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders breadcrumb with link to Projecten", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /projecten/i });
      expect(link).toHaveAttribute("href", "/dashboard/projects");
    });
  });

  it("renders StatusBadge with active status", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);
    await waitFor(() => expect(screen.getByText("Actief")).toBeInTheDocument());
  });

  it("renders key facts: budget", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);
    await waitFor(() => {
      // budget is displayed via formatBudget mock
      expect(screen.getByText(/budget/i)).toBeInTheDocument();
    });
  });

  it("renders phase card with phase name", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);
    await waitFor(() => expect(screen.getByText("Fundering")).toBeInTheDocument());
  });

  it("renders Documenten tab", async () => {
    const { default: DetailPage } = await import("@/app/dashboard/projects/[id]/page");
    render(<DetailPage params={Promise.resolve({ id: "proj-1" })} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: /documenten/i })).toBeInTheDocument());
  });
});
