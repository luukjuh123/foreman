import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "mock-token"),
}));

// ---------------------------------------------------------------------------
// Mock punch list API module
// ---------------------------------------------------------------------------

const mockPunchItems = [
  {
    id: "pi-1",
    project_id: "proj-1",
    task_id: "task-1",
    description: "Dakgoot los",
    status: "open",
    assigned_staff_id: null,
    photo_before_url: "https://cdn.example.com/before.jpg",
    photo_after_url: null,
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    resolved_at: null,
  },
  {
    id: "pi-2",
    project_id: "proj-1",
    task_id: "task-1",
    description: "Voeg ontbreekt bij raam",
    status: "fixed",
    assigned_staff_id: null,
    photo_before_url: null,
    photo_after_url: "https://cdn.example.com/after.jpg",
    created_at: "2026-05-20T11:00:00Z",
    updated_at: "2026-05-21T09:00:00Z",
    resolved_at: "2026-05-21T09:00:00Z",
  },
  {
    id: "pi-3",
    project_id: "proj-1",
    task_id: "task-2",
    description: "Schroeven ontbreken",
    status: "verified",
    assigned_staff_id: null,
    photo_before_url: null,
    photo_after_url: null,
    created_at: "2026-05-20T12:00:00Z",
    updated_at: "2026-05-21T10:00:00Z",
    resolved_at: "2026-05-21T10:00:00Z",
  },
];

vi.mock("@/lib/punch-items", () => ({
  listPunchItems: vi.fn(async (_projectId: string, status?: string) => {
    const items = status
      ? mockPunchItems.filter((i) => i.status === status)
      : mockPunchItems;
    return { data: items, total: items.length };
  }),
  createPunchItem: vi.fn(async (_projectId: string, body: Record<string, unknown>) => ({
    id: "pi-new",
    project_id: _projectId,
    task_id: body.task_id,
    description: body.description,
    status: "open",
    assigned_staff_id: null,
    photo_before_url: body.photo_before_url ?? null,
    photo_after_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
  })),
  updatePunchItem: vi.fn(async (_projectId: string, itemId: string, body: Record<string, unknown>) => ({
    ...mockPunchItems.find((i) => i.id === itemId),
    ...body,
    resolved_at: body.status !== "open" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  })),
  deletePunchItem: vi.fn(async () => undefined),
  getPunchItemsSummary: vi.fn(async () => [
    { task_id: "task-1", task_name: "Dakwerk", open: 1, fixed: 1, verified: 0, total: 2 },
    { task_id: "task-2", task_name: "Kozijnen", open: 0, fixed: 0, verified: 1, total: 1 },
  ]),
}));

import PunchListTab from "@/components/punch-list/PunchListTab";

describe("PunchListTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all punch items", async () => {
    render(<PunchListTab projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText("Dakgoot los")).toBeInTheDocument();
      expect(screen.getByText("Voeg ontbreekt bij raam")).toBeInTheDocument();
      expect(screen.getByText("Schroeven ontbreken")).toBeInTheDocument();
    });
  });

  it("shows correct status badges with right colors", async () => {
    render(<PunchListTab projectId="proj-1" />);

    await waitFor(() => {
      // open = red badge
      const openBadge = screen.getByTestId("status-badge-pi-1");
      expect(openBadge).toHaveClass("bg-red-100");

      // fixed = yellow badge
      const fixedBadge = screen.getByTestId("status-badge-pi-2");
      expect(fixedBadge).toHaveClass("bg-yellow-100");

      // verified = green badge
      const verifiedBadge = screen.getByTestId("status-badge-pi-3");
      expect(verifiedBadge).toHaveClass("bg-green-100");
    });
  });

  it("filters by status", async () => {
    render(<PunchListTab projectId="proj-1" />);

    await waitFor(() => expect(screen.getByText("Dakgoot los")).toBeInTheDocument());

    // Click the "Open" filter button
    fireEvent.click(screen.getByRole("button", { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText("Dakgoot los")).toBeInTheDocument();
      expect(screen.queryByText("Voeg ontbreekt bij raam")).not.toBeInTheDocument();
    });
  });

  it("shows before/after photo comparison when photos present", async () => {
    render(<PunchListTab projectId="proj-1" />);

    await waitFor(() => {
      // item pi-1 has before photo
      const beforeImg = screen.getByAltText("Voor foto - Dakgoot los");
      expect(beforeImg).toBeInTheDocument();
      expect(beforeImg).toHaveAttribute("src", "https://cdn.example.com/before.jpg");
    });
  });

  it("quick-action mark as fixed calls updatePunchItem", async () => {
    const { updatePunchItem } = await import("@/lib/punch-items");
    render(<PunchListTab projectId="proj-1" />);

    await waitFor(() => expect(screen.getByText("Dakgoot los")).toBeInTheDocument());

    // Click "Markeer als gerepareerd" button for pi-1
    fireEvent.click(screen.getByTestId("mark-fixed-pi-1"));

    await waitFor(() => {
      expect(updatePunchItem).toHaveBeenCalledWith("proj-1", "pi-1", expect.objectContaining({
        status: "fixed",
      }));
    });
  });
});

// ---------------------------------------------------------------------------
// Status badge unit tests
// ---------------------------------------------------------------------------

import { PunchStatusBadge } from "@/components/punch-list/PunchStatusBadge";

describe("PunchStatusBadge", () => {
  it("renders open badge in red", () => {
    const { container } = render(<PunchStatusBadge status="open" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass("bg-red-100");
    expect(badge.textContent).toMatch(/open/i);
  });

  it("renders fixed badge in yellow", () => {
    const { container } = render(<PunchStatusBadge status="fixed" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass("bg-yellow-100");
  });

  it("renders verified badge in green", () => {
    const { container } = render(<PunchStatusBadge status="verified" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass("bg-green-100");
  });
});

// ---------------------------------------------------------------------------
// Agenda badge count
// ---------------------------------------------------------------------------

import { AgendaPunchBadge } from "@/components/punch-list/AgendaPunchBadge";

describe("AgendaPunchBadge", () => {
  it("shows open count for a task", () => {
    render(<AgendaPunchBadge openCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not render when openCount is zero", () => {
    const { container } = render(<AgendaPunchBadge openCount={0} />);
    expect(container.firstChild).toBeNull();
  });
});
