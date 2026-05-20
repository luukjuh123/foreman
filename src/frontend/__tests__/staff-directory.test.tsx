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

vi.mock("@/lib/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff")>();
  return {
    ...actual,
    listStaff: vi.fn(),
    createStaff: vi.fn(),
    updateStaff: vi.fn(),
    deleteStaff: vi.fn(),
  };
});

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

const mockListResponse = {
  data: [
    mockStaff({ id: "staff-1", full_name: "Jan de Vries", role: "Timmerman" }),
    mockStaff({ id: "staff-2", full_name: "Piet Bakker", role: "Metselaar", active: false }),
  ],
  total: 2,
  page: 1,
  per_page: 20,
};

describe("formatRate", () => {
  it("formats 3500 cents to Dutch euro format", async () => {
    const { formatRate } = await import("@/lib/staff");
    expect(formatRate(3500)).toContain("35");
    expect(formatRate(3500)).toContain("€");
  });

  it("formats 0 cents", async () => {
    const { formatRate } = await import("@/lib/staff");
    expect(formatRate(0)).toContain("€");
    expect(formatRate(0)).toContain("0");
  });
});

describe("StaffPage loading state", () => {
  it("shows loading text while fetching", async () => {
    const { listStaff } = await import("@/lib/staff");
    vi.mocked(listStaff).mockReturnValue(new Promise(() => {}));

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("StaffPage renders staff list", () => {
  beforeEach(async () => {
    const { listStaff } = await import("@/lib/staff");
    vi.mocked(listStaff).mockResolvedValue(mockListResponse);
  });

  it("renders Personeel heading", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);
    expect(screen.getByText("Personeel")).toBeInTheDocument();
  });

  it("renders Nieuw Personeelslid button", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);
    expect(screen.getByRole("button", { name: /nieuw personeelslid/i })).toBeInTheDocument();
  });

  it("renders staff member names after loading", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
      expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
    });
  });

  it("renders staff roles", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText("Timmerman")).toBeInTheDocument();
      expect(screen.getByText("Metselaar")).toBeInTheDocument();
    });
  });

  it("renders hourly rate in Dutch euro format", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/35,00/).length).toBeGreaterThan(0);
    });
  });

  it("shows active/inactive status badge", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/actief/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/inactief/i).length).toBeGreaterThan(0);
    });
  });
});

describe("StaffPage empty state", () => {
  it("shows empty state message when no staff", async () => {
    const { listStaff } = await import("@/lib/staff");
    vi.mocked(listStaff).mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 });

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen personeel/i)).toBeInTheDocument();
    });
  });
});

describe("StaffPage create dialog", () => {
  beforeEach(async () => {
    const { listStaff } = await import("@/lib/staff");
    vi.mocked(listStaff).mockResolvedValue(mockListResponse);
  });

  it("opens create dialog when Nieuw Personeelslid is clicked", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    fireEvent.click(screen.getByRole("button", { name: /nieuw personeelslid/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("create dialog contains Naam field", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    fireEvent.click(screen.getByRole("button", { name: /nieuw personeelslid/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/naam/i)).toBeInTheDocument();
    });
  });

  it("submitting create form calls createStaff and refreshes list", async () => {
    const { createStaff, listStaff } = await import("@/lib/staff");
    const newMember = mockStaff({ id: "staff-3", full_name: "Kees Smit", role: "Schilder" });
    vi.mocked(createStaff).mockResolvedValue(newMember);
    vi.mocked(listStaff).mockResolvedValue({
      ...mockListResponse,
      data: [...mockListResponse.data, newMember],
      total: 3,
    });

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    fireEvent.click(screen.getByRole("button", { name: /nieuw personeelslid/i }));
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.change(screen.getByLabelText(/naam/i), { target: { value: "Kees Smit" } });
    fireEvent.change(screen.getByLabelText(/rol/i), { target: { value: "Schilder" } });
    fireEvent.change(screen.getByLabelText(/uurtarief/i), { target: { value: "25" } });

    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(createStaff).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: "Kees Smit", role: "Schilder" })
      );
    });
  });
});

describe("StaffPage edit dialog", () => {
  beforeEach(async () => {
    const { listStaff } = await import("@/lib/staff");
    vi.mocked(listStaff).mockResolvedValue(mockListResponse);
  });

  it("opens edit dialog when edit button is clicked", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    const editButtons = screen.getAllByRole("button", { name: /bewerk/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("edit dialog is pre-filled with staff data", async () => {
    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    const editButtons = screen.getAllByRole("button", { name: /bewerk/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/naam/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Jan de Vries");
    });
  });

  it("submitting edit form calls updateStaff with staff id", async () => {
    const { updateStaff, listStaff } = await import("@/lib/staff");
    vi.mocked(updateStaff).mockResolvedValue(mockStaff({ full_name: "Jan Gewijzigd" }));
    vi.mocked(listStaff).mockResolvedValue(mockListResponse);

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    const editButtons = screen.getAllByRole("button", { name: /bewerk/i });
    fireEvent.click(editButtons[0]);
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.change(screen.getByLabelText(/naam/i), { target: { value: "Jan Gewijzigd" } });
    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(updateStaff).toHaveBeenCalledWith(
        "staff-1",
        expect.objectContaining({ full_name: "Jan Gewijzigd" })
      );
    });
  });
});

describe("StaffPage delete", () => {
  it("calls deleteStaff when delete button is clicked", async () => {
    const { deleteStaff, listStaff } = await import("@/lib/staff");
    vi.mocked(listStaff).mockResolvedValueOnce(mockListResponse);
    vi.mocked(deleteStaff).mockResolvedValue(undefined);
    // After delete, re-fetch returns remaining staff
    vi.mocked(listStaff).mockResolvedValueOnce({ data: [mockListResponse.data[1]], total: 1, page: 1, per_page: 20 });

    const { default: StaffPage } = await import("@/app/dashboard/staff/page");
    render(<StaffPage />);

    await waitFor(() => screen.getByText("Jan de Vries"));

    const deleteButtons = screen.getAllByRole("button", { name: /verwijder/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(deleteStaff).toHaveBeenCalledWith("staff-1");
    });
  });
});
