import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeStaff = (overrides: Partial<{
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  hourly_rate_cents: number;
  weekly_hours_target: number | null;
  active: boolean;
}> = {}) => ({
  id: overrides.id ?? "staff-1",
  owner_id: "owner-1",
  full_name: overrides.full_name ?? "Jan de Vries",
  role: overrides.role ?? "Timmerman",
  email: overrides.email !== undefined ? overrides.email : "jan@example.com",
  phone: overrides.phone !== undefined ? overrides.phone : "0612345678",
  hourly_rate_cents: overrides.hourly_rate_cents ?? 4500,
  weekly_hours_target: overrides.weekly_hours_target !== undefined ? overrides.weekly_hours_target : 40,
  active: overrides.active !== undefined ? overrides.active : true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  availability: [],
});

const makeListResponse = (
  staff: ReturnType<typeof makeStaff>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: staff,
  total: overrides.total ?? staff.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests — loading state
// ---------------------------------------------------------------------------

describe("StaffDirectoryPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — error state
// ---------------------------------------------------------------------------

describe("StaffDirectoryPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — empty state
// ---------------------------------------------------------------------------

describe("StaffDirectoryPage — empty state", () => {
  it("shows empty state message when no staff", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen medewerkers/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — renders staff list
// ---------------------------------------------------------------------------

describe("StaffDirectoryPage — renders staff list", () => {
  it("renders staff names", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeStaff({ id: "staff-1", full_name: "Jan de Vries" }),
        makeStaff({ id: "staff-2", full_name: "Klaas Bakker" }),
      ])
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
      expect(screen.getByText("Klaas Bakker")).toBeInTheDocument();
    });
  });

  it("renders staff roles", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeStaff({ id: "staff-1", role: "Timmerman" }),
        makeStaff({ id: "staff-2", full_name: "Piet", role: "Elektricien" }),
      ])
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Timmerman")).toBeInTheDocument();
      expect(screen.getByText("Elektricien")).toBeInTheDocument();
    });
  });

  it("renders hourly rate formatted as Dutch locale euros", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeStaff({ hourly_rate_cents: 4500 })])
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      // €45,00 in Dutch locale
      expect(screen.getByText(/45,00/)).toBeInTheDocument();
    });
  });

  it("renders active status badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeStaff({ id: "staff-1", active: true }),
        makeStaff({ id: "staff-2", full_name: "Inactief Persoon", active: false }),
      ])
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Actief")).toBeInTheDocument();
      expect(screen.getByText("Inactief")).toBeInTheDocument();
    });
  });

  it("renders email when present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeStaff({ email: "jan@bouw.nl" })])
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText("jan@bouw.nl")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — header and add button
// ---------------------------------------------------------------------------

describe("StaffDirectoryPage — header", () => {
  it("renders Personeel page title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /personeel/i })).toBeInTheDocument();
    });
  });

  it("renders Medewerker toevoegen button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /medewerker toevoegen/i })).toBeInTheDocument();
    });
  });

  it("opens add dialog when Medewerker toevoegen button is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => screen.getByRole("button", { name: /medewerker toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /medewerker toevoegen/i }));

    await waitFor(() => {
      // The dialog/form should show a full_name field
      expect(screen.getByLabelText(/naam/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — pagination
// ---------------------------------------------------------------------------

describe("StaffDirectoryPage — pagination", () => {
  it("shows next page button when there are more pages", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeStaff({ id: `staff-${i}`, full_name: `Medewerker ${i}` })
        ),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("shows previous page button after navigating to page 2", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeStaff({ id: `staff-${i}`, full_name: `Medewerker ${i}` })
        ),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => screen.getByRole("button", { name: /volgende/i }));
    fireEvent.click(screen.getByRole("button", { name: /volgende/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /vorige/i })).toBeInTheDocument();
    });
  });

  it("does not show next page button when on last page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeStaff()], { total: 1, page: 1, per_page: 20 })
    );

    const { default: StaffDirectoryPage } = await import(
      "@/app/dashboard/staff/page"
    );
    render(<StaffDirectoryPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /volgende/i })).toBeNull();
    });
  });
});
