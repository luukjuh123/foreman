import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProjectResponse } from "@/lib/types";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects"),
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock lib/projects
vi.mock("@/lib/projects", () => ({
  listProjects: vi.fn(),
  calcTaskSummary: vi.fn((p) => ({ done: 0, total: 0 })),
  formatBudget: vi.fn((c) => `€${c / 100}`),
  formatDate: vi.fn((d) => d ?? ""),
}));

import { listProjects } from "@/lib/projects";

const mockProjects: ProjectResponse[] = [
  {
    id: "1",
    name: "Woningbouw Almere",
    description: "Nieuwbouw project",
    status: "active",
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    budget_cents: 500000,
    phases: [],
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Renovatie Utrecht",
    description: null,
    status: "draft",
    start_date: null,
    end_date: null,
    budget_cents: null,
    phases: [],
    created_at: "2024-02-01T00:00:00Z",
  },
  {
    id: "3",
    name: "Kantoorpand Den Haag",
    description: "Kantoor verbouwing",
    status: "completed",
    start_date: "2023-01-01",
    end_date: "2023-12-31",
    budget_cents: 200000,
    phases: [],
    created_at: "2023-01-01T00:00:00Z",
  },
];

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue({
      data: mockProjects,
      total: mockProjects.length,
      page: 1,
      per_page: 50,
    });
  });

  it("renders search box", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);
    expect(screen.getByPlaceholderText(/zoeken/i)).toBeInTheDocument();
  });

  it("filters projects by search term", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    // Wait for projects to load
    await screen.findByText("Woningbouw Almere");

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "Renovatie" } });

    expect(screen.getByText("Renovatie Utrecht")).toBeInTheDocument();
    expect(screen.queryByText("Woningbouw Almere")).not.toBeInTheDocument();
  });

  it("shows empty state when no projects match search", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await screen.findByText("Woningbouw Almere");

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });

    expect(screen.getByText(/geen projecten/i)).toBeInTheDocument();
  });

  it("shows skeleton loading state initially before data loads", async () => {
    // Delay resolution
    vi.mocked(listProjects).mockReturnValue(new Promise(() => {}));
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    const { container } = render(<ProjectsPage />);

    // Skeleton elements should be present
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("filters by status tab active", async () => {
    const { default: ProjectsPage } = await import("@/app/dashboard/projects/page");
    render(<ProjectsPage />);

    await screen.findByText("Woningbouw Almere");

    const activeTab = screen.getByRole("tab", { name: /actief/i });
    fireEvent.click(activeTab);

    expect(screen.getByText("Woningbouw Almere")).toBeInTheDocument();
    expect(screen.queryByText("Renovatie Utrecht")).not.toBeInTheDocument();
  });
});
