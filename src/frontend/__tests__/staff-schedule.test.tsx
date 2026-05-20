import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const { mockListStaff, mockListAssignments, mockGetProjectColor } = vi.hoisted(() => ({
  mockListStaff: vi.fn(),
  mockListAssignments: vi.fn(),
  mockGetProjectColor: vi.fn(() => "#3b82f6"),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/staff/schedule"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/staff", () => ({
  listStaff: mockListStaff,
  listAssignments: mockListAssignments,
}));

vi.mock("@/lib/agenda", () => ({
  getProjectColor: mockGetProjectColor,
}));

const makeStaffList = () => ({
  data: [
    { id: "staff-1", full_name: "Jan de Vries", role: "Timmerman", hourly_rate_cents: 4500, active: true },
    { id: "staff-2", full_name: "Piet Bakker", role: "Loodgieter", hourly_rate_cents: 5000, active: true },
  ],
  total: 2,
  page: 1,
  per_page: 100,
});

const makeAssignment = (overrides: Partial<{
  id: string;
  staff_id: string;
  project_id: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  project_name: string;
}> = {}) => ({
  id: "assign-1",
  staff_id: "staff-1",
  project_id: "proj-1",
  task_id: null,
  start_at: "2026-05-18T08:00:00",
  end_at: "2026-05-18T16:00:00",
  notes: "Fundering gieten",
  project_name: "Renovatie Centrum",
  ...overrides,
});

import StaffSchedulePage from "@/app/dashboard/staff/schedule/page";

describe("StaffSchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectColor.mockReturnValue("#3b82f6");
    mockListStaff.mockResolvedValue(makeStaffList());
    mockListAssignments.mockResolvedValue([]);
  });

  it("renders page title Personeelsplanning", async () => {
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText(/personeelsplanning/i)).toBeInTheDocument();
    });
  });

  it("renders 7 day column headers with Dutch abbreviations", async () => {
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText("Ma")).toBeInTheDocument();
    expect(screen.getByText("Di")).toBeInTheDocument();
    expect(screen.getByText("Wo")).toBeInTheDocument();
    expect(screen.getByText("Do")).toBeInTheDocument();
    expect(screen.getByText("Vr")).toBeInTheDocument();
    expect(screen.getByText("Za")).toBeInTheDocument();
    expect(screen.getByText("Zo")).toBeInTheDocument();
  });

  it("renders staff member names as row headers", async () => {
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    });
    expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
  });

  it("renders assignment block with project name and time range", async () => {
    mockListAssignments.mockImplementation(({ staffId }: { staffId?: string }) => {
      if (staffId === "staff-1") {
        return Promise.resolve([makeAssignment()]);
      }
      return Promise.resolve([]);
    });

    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Renovatie Centrum")).toBeInTheDocument();
    });
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
    expect(screen.getByText(/16:00/)).toBeInTheDocument();
  });

  it("renders assignment notes", async () => {
    mockListAssignments.mockImplementation(({ staffId }: { staffId?: string }) => {
      if (staffId === "staff-1") {
        return Promise.resolve([makeAssignment({ notes: "Fundering gieten" })]);
      }
      return Promise.resolve([]);
    });

    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Fundering gieten")).toBeInTheDocument();
    });
  });

  it("handles empty assignments — shows staff rows with no blocks", async () => {
    mockListAssignments.mockResolvedValue([]);
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    });
    expect(screen.queryByText("Renovatie Centrum")).not.toBeInTheDocument();
  });

  it("renders week navigation buttons", async () => {
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /vorige week/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /volgende week/i })).toBeInTheDocument();
  });

  it("clicking next week re-fetches", async () => {
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });

    const initialCallCount = mockListAssignments.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /volgende week/i }));

    await waitFor(() => {
      expect(mockListAssignments.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it("shows loading state", () => {
    mockListStaff.mockReturnValue(new Promise(() => {}));
    mockListAssignments.mockReturnValue(new Promise(() => {}));
    render(<StaffSchedulePage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("shows error state when staff fetch fails", async () => {
    mockListStaff.mockRejectedValue(new Error("Netwerkfout"));
    render(<StaffSchedulePage />);
    await waitFor(() => {
      expect(screen.getByText(/netwerkfout/i)).toBeInTheDocument();
    });
  });
});
