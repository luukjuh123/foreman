import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/staff/schedule"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import StaffSchedulePage from "@/app/dashboard/staff/schedule/page";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const mockStaffList = {
  data: [
    { id: "staff-1", full_name: "Jan de Vries", role: "Timmerman", hourly_rate_cents: 4500, active: true },
    { id: "staff-2", full_name: "Pieter Bakker", role: "Schilder", hourly_rate_cents: 4000, active: true },
    { id: "staff-3", full_name: "Henk Smits", role: "Metselaar", hourly_rate_cents: 4200, active: false },
  ],
  total: 3,
  page: 1,
  per_page: 100,
};

const mockProjectList = {
  data: [
    { id: "proj-1", name: "Renovatie Centrum", status: "active" },
    { id: "proj-2", name: "Nieuwbouw Noord", status: "active" },
  ],
  total: 2,
  page: 1,
  per_page: 100,
};

// Compute the current week's Monday and Tuesday dynamically so the
// assignment filter (which uses the real Date) always puts them in the
// visible week, regardless of when the tests run.
function getMondayOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(8, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
const MONDAY = getMondayOfCurrentWeek();
const TUESDAY = (() => {
  const d = new Date(MONDAY + "T08:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

const mockAssignmentsStaff1 = [
  {
    id: "asgn-1",
    staff_id: "staff-1",
    project_id: "proj-1",
    task_id: null,
    start_at: `${MONDAY}T08:00:00`,
    end_at: `${MONDAY}T16:00:00`,
    notes: null,
    created_at: "2026-05-01T00:00:00",
  },
];

const mockAssignmentsStaff2 = [
  {
    id: "asgn-2",
    staff_id: "staff-2",
    project_id: "proj-2",
    task_id: null,
    start_at: `${TUESDAY}T08:00:00`, // Tuesday
    end_at: `${TUESDAY}T16:00:00`,
    notes: null,
    created_at: "2026-05-01T00:00:00",
  },
];

function setupMocks(
  staff1Assignments = mockAssignmentsStaff1,
  staff2Assignments = mockAssignmentsStaff2
) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.includes("/staff/")) return Promise.resolve(mockStaffList);
    if (path.includes("/projects/")) return Promise.resolve(mockProjectList);
    if (path.includes("staff_id=staff-1")) return Promise.resolve(staff1Assignments);
    if (path.includes("staff_id=staff-2")) return Promise.resolve(staff2Assignments);
    return Promise.resolve([]);
  });
}

describe("StaffSchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pin only Date (not timers) to 2026-05-19 — in the week of Mon 2026-05-18 —
    // so weekStart resolves to 2026-05-18, matching the mock assignment dates.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-19T10:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state while fetching", () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<StaffSchedulePage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders day headers for weekdays Maandag through Vrijdag", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText("Maandag")).toBeInTheDocument();
    expect(screen.getByText("Dinsdag")).toBeInTheDocument();
    expect(screen.getByText("Woensdag")).toBeInTheDocument();
    expect(screen.getByText("Donderdag")).toBeInTheDocument();
    expect(screen.getByText("Vrijdag")).toBeInTheDocument();
  });

  it("renders active staff names in rows", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByText("Pieter Bakker")).toBeInTheDocument();
    // Inactive staff should not appear
    expect(screen.queryByText("Henk Smits")).not.toBeInTheDocument();
  });

  it("renders staff roles in the left column", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText("Timmerman")).toBeInTheDocument();
    expect(screen.getByText("Schilder")).toBeInTheDocument();
  });

  it("shows assignment blocks with project name on correct days", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    // "Renovatie Centrum" is assigned to staff-1 on Monday
    expect(screen.getByText("Renovatie Centrum")).toBeInTheDocument();
    // "Nieuwbouw Noord" is assigned to staff-2 on Tuesday
    expect(screen.getByText("Nieuwbouw Noord")).toBeInTheDocument();
  });

  it("shows page title Personeelsplanning", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.getByText("Personeelsplanning")).toBeInTheDocument();
    });
  });

  it("renders vorige week and volgende week navigation buttons", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /vorige/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
  });

  it("clicking volgende week triggers a new data fetch", async () => {
    setupMocks();
    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    const initialCallCount = mockApiFetch.mock.calls.length;

    const nextBtn = screen.getByRole("button", { name: /volgende/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockApiFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it("shows empty state message when no assignments for the week", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path.includes("/staff/")) return Promise.resolve(mockStaffList);
      if (path.includes("/projects/")) return Promise.resolve(mockProjectList);
      return Promise.resolve([]);
    });

    render(<StaffSchedulePage />);

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/geen inplanningen/i)).toBeInTheDocument();
  });
});
