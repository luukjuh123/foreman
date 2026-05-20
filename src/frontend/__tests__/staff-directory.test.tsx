import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/staff"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockStaff = (overrides: Partial<{
  id: string;
  full_name: string;
  role: string;
  email: string;
  phone: string;
  hourly_rate_cents: number;
  weekly_hours_target: number;
  active: boolean;
}> = {}) => ({
  id: overrides.id ?? "staff-1",
  owner_id: "user-1",
  full_name: overrides.full_name ?? "Jan de Vries",
  role: overrides.role ?? "Timmerman",
  email: overrides.email ?? "jan@example.com",
  phone: overrides.phone ?? "0612345678",
  hourly_rate_cents: overrides.hourly_rate_cents ?? 3500,
  weekly_hours_target: overrides.weekly_hours_target ?? 40,
  active: overrides.active ?? true,
  created_at: "2024-01-01T00:00:00",
  updated_at: "2024-01-01T00:00:00",
  availability: [],
});

const makeListResponse = (
  items: ReturnType<typeof mockStaff>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: items,
  total: overrides.total ?? items.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

const twoMembers = [
  mockStaff({ id: "staff-1", full_name: "Jan de Vries", role: "Timmerman", active: true }),
  mockStaff({ id: "staff-2", full_name: "Piet Bakker", role: "Metselaar", active: false }),
];

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

describe("formatRate", () => {
  it("formats 3500 cents to Dutch euro format containing 35", async () => {
    const { formatRate } = await import("@/lib/staff");
    expect(formatRate(3500)).toContain("35");
    expect(formatRate(3500)).toContain("€");
  });

  it("formats 0 cents and includes euro sign", async () => {
    const { formatRate } = await import("@/lib/staff");
    expect(formatRate(0)).toContain("€");
    expect(formatRate(0)).toContain("0");
  });
});

describe("StaffPage renders staff list", () => {
  beforeEach(async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse(twoMembers));
  });

  it("renders Personeel heading", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);
    expect(screen.getByRole("heading", { name: /personeel/i })).toBeInTheDocument();
  });

  it("renders Nieuw button", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);
    expect(screen.getByRole("button", { name: /^nieuw$/i })).toBeInTheDocument();
  });

  it("renders table column headers in Dutch", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText("Naam")).toBeInTheDocument();
      expect(screen.getByText("Functie")).toBeInTheDocument();
      expect(screen.getByText("Uurloon")).toBeInTheDocument();
      expect(screen.getByText("Uren/week")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Acties")).toBeInTheDocument();
    });
  });

  it("renders staff member names in table rows", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
      expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
    });
  });

  it("shows Actief badge for active staff", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText("Actief")).toBeInTheDocument();
    });
  });

  it("shows Inactief badge for inactive staff", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText("Inactief")).toBeInTheDocument();
    });
  });

  it("renders edit and delete action buttons per row", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    const editButtons = screen.getAllByRole("button", { name: /bewerk/i });
    const deleteButtons = screen.getAllByRole("button", { name: /verwijder/i });
    expect(editButtons.length).toBe(2);
    expect(deleteButtons.length).toBe(2);
  });
});

describe("StaffPage empty state", () => {
  it("shows empty state message when no staff", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen personeel/i)).toBeInTheDocument();
    });
  });
});

describe("StaffPage loading state", () => {
  it("shows loading text while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("StaffPage add staff form", () => {
  beforeEach(async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse(twoMembers));
  });

  it("opens form dialog when Nieuw is clicked", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    fireEvent.click(screen.getByRole("button", { name: /^nieuw$/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

describe("StaffPage delete confirmation", () => {
  beforeEach(async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse(twoMembers));
  });

  it("shows confirmation dialog when delete button is clicked", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    const deleteButtons = screen.getAllByRole("button", { name: /verwijder/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/weet u het zeker/i)).toBeInTheDocument();
    });
  });
});

describe("StaffPage pagination", () => {
  it("shows Volgende button when there are more pages", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(twoMembers, { total: 40, per_page: 20 })
    );

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("does not show Volgende button when only one page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse(twoMembers, { total: 2, per_page: 20 }));

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    expect(screen.queryByRole("button", { name: /volgende/i })).toBeNull();
  });
});
