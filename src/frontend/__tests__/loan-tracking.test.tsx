import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/staff/loans"),
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
  hourly_rate_cents: number;
  active: boolean;
}> = {}) => ({
  id: overrides.id ?? "staff-1",
  full_name: overrides.full_name ?? "Jan de Vries",
  role: overrides.role ?? "timmerman",
  hourly_rate_cents: overrides.hourly_rate_cents ?? 3500,
  active: overrides.active ?? true,
});

const makeDeduction = (overrides: Partial<{
  id: string;
  loan_id: string;
  amount_cents: number;
  deduction_date: string;
  notes: string | null;
  created_at: string;
}> = {}) => ({
  id: overrides.id ?? "ded-1",
  loan_id: overrides.loan_id ?? "loan-1",
  amount_cents: overrides.amount_cents ?? 5000,
  deduction_date: overrides.deduction_date ?? "2024-02-01",
  notes: overrides.notes ?? null,
  created_at: overrides.created_at ?? "2024-02-01T10:00:00Z",
});

const makeLoan = (overrides: Partial<{
  id: string;
  staff_id: string;
  principal_cents: number;
  issued_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deductions: ReturnType<typeof makeDeduction>[];
  deducted_cents: number;
  outstanding_cents: number;
}> = {}) => ({
  id: overrides.id ?? "loan-1",
  staff_id: overrides.staff_id ?? "staff-1",
  principal_cents: overrides.principal_cents ?? 50000,
  issued_date: overrides.issued_date ?? "2024-01-15",
  notes: overrides.notes ?? null,
  created_at: overrides.created_at ?? "2024-01-15T10:00:00Z",
  updated_at: overrides.updated_at ?? "2024-01-15T10:00:00Z",
  deductions: overrides.deductions ?? [],
  deducted_cents: overrides.deducted_cents ?? 0,
  outstanding_cents: overrides.outstanding_cents ?? 50000,
});

const makeBalance = (overrides: Partial<{
  staff_id: string;
  total_principal_cents: number;
  total_deducted_cents: number;
  outstanding_cents: number;
  loans: ReturnType<typeof makeLoan>[];
}> = {}) => ({
  staff_id: overrides.staff_id ?? "staff-1",
  total_principal_cents: overrides.total_principal_cents ?? 50000,
  total_deducted_cents: overrides.total_deducted_cents ?? 0,
  outstanding_cents: overrides.outstanding_cents ?? 50000,
  loans: overrides.loans ?? [makeLoan()],
});

const makeStaffListResponse = (staff: ReturnType<typeof makeStaff>[]) => ({
  data: staff,
  total: staff.length,
  page: 1,
  per_page: 100,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoanTrackingPage — loading state", () => {
  it("shows loading indicator while fetching staff", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("LoanTrackingPage — page title", () => {
  it("renders Voorschotten heading", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeStaffListResponse([]));

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /voorschotten/i })).toBeInTheDocument();
    });
  });
});

describe("LoanTrackingPage — staff selector", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders staff selector after staff loaded", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeStaffListResponse([
        makeStaff({ id: "staff-1", full_name: "Jan de Vries" }),
        makeStaff({ id: "staff-2", full_name: "Piet Bakker" }),
      ])
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  it("renders staff names in selector", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeStaffListResponse([
        makeStaff({ id: "staff-1", full_name: "Jan de Vries" }),
        makeStaff({ id: "staff-2", full_name: "Piet Bakker" }),
      ])
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
      expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
    });
  });
});

describe("LoanTrackingPage — balance summary cards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows summary cards after selecting staff", async () => {
    const apiFetch = await getApiFetch();
    // First call: staff list
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1", full_name: "Jan de Vries" })])
    );
    // Second call: balance for staff-1
    apiFetch.mockResolvedValueOnce(
      makeBalance({
        staff_id: "staff-1",
        total_principal_cents: 150000,
        total_deducted_cents: 50000,
        outstanding_cents: 100000,
      })
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    // Select a staff member
    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => {
      // total principal: €1.500,00
      expect(screen.getByText(/1\.500,00/)).toBeInTheDocument();
      // total deducted: €500,00 — multiple elements may show this, use getAllBy
      expect(screen.getAllByText(/500,00/).length).toBeGreaterThan(0);
      // outstanding: €1.000,00
      expect(screen.getByText(/1\.000,00/)).toBeInTheDocument();
    });
  });

  it("shows card labels in Dutch", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1", full_name: "Jan de Vries" })])
    );
    apiFetch.mockResolvedValueOnce(makeBalance());

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => {
      expect(screen.getByText(/totaal verstrekt/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ingehouden/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/openstaand/i).length).toBeGreaterThan(0);
    });
  });
});

describe("LoanTrackingPage — loan list", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders loans with issued date, principal, deducted, outstanding", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1", full_name: "Jan de Vries" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeBalance({
        loans: [
          makeLoan({
            id: "loan-1",
            principal_cents: 50000,
            issued_date: "2024-01-15",
            deducted_cents: 10000,
            outstanding_cents: 40000,
          }),
        ],
        total_principal_cents: 50000,
        total_deducted_cents: 10000,
        outstanding_cents: 40000,
      })
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => {
      // issued date formatted as dd-MM-yyyy
      expect(screen.getByText("15-01-2024")).toBeInTheDocument();
      // principal €500,00 — may appear multiple times (card + loan row)
      expect(screen.getAllByText(/500,00/).length).toBeGreaterThan(0);
      // outstanding €400,00 — may appear multiple times (card + loan row)
      expect(screen.getAllByText(/400,00/).length).toBeGreaterThan(0);
    });
  });

  it("renders notes when present on a loan", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeBalance({
        loans: [makeLoan({ notes: "Noodgeval gereedschap" })],
      })
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => {
      expect(screen.getByText("Noodgeval gereedschap")).toBeInTheDocument();
    });
  });
});

describe("LoanTrackingPage — nieuw voorschot button", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Nieuw voorschot button after staff loaded", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeStaffListResponse([makeStaff()]));

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /nieuw voorschot/i })
      ).toBeInTheDocument();
    });
  });
});

describe("LoanTrackingPage — empty state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows no-loans message when staff has no loans", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeBalance({
        total_principal_cents: 0,
        total_deducted_cents: 0,
        outstanding_cents: 0,
        loans: [],
      })
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => {
      expect(screen.getByText(/geen voorschotten/i)).toBeInTheDocument();
    });
  });
});

describe("LoanTrackingPage — expandable deductions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows deduction details when loan is expanded", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeBalance({
        loans: [
          makeLoan({
            id: "loan-1",
            deductions: [
              makeDeduction({
                id: "ded-1",
                amount_cents: 5000,
                deduction_date: "2024-02-01",
              }),
            ],
            deducted_cents: 5000,
            outstanding_cents: 45000,
          }),
        ],
      })
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => screen.getByText("15-01-2024"));

    // Click toggle/expand button on the loan row
    const expandButtons = screen.getAllByRole("button", { name: /toon inhoudingen|verberg inhoudingen/i });
    fireEvent.click(expandButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("01-02-2024")).toBeInTheDocument();
    });
  });
});

describe("LoanTrackingPage — inhouding toevoegen button", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Inhouding toevoegen button per loan", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(
      makeStaffListResponse([makeStaff({ id: "staff-1" })])
    );
    apiFetch.mockResolvedValueOnce(
      makeBalance({
        loans: [makeLoan({ id: "loan-1" })],
      })
    );

    const { default: LoanTrackingPage } = await import(
      "@/app/dashboard/staff/loans/page"
    );
    render(<LoanTrackingPage />);

    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "staff-1" } });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /inhouding toevoegen/i })
      ).toBeInTheDocument();
    });
  });
});
