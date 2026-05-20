import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";

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

const makeDeduction = (overrides = {}) => ({
  id: "ded-1",
  loan_id: "loan-1",
  amount_cents: 5000,
  deduction_date: "2024-02-01",
  notes: null,
  created_at: "2024-02-01T00:00:00Z",
  ...overrides,
});

const makeLoan = (overrides = {}) => ({
  id: "loan-1",
  staff_id: "staff-1",
  principal_cents: 50000,
  issued_date: "2024-01-01",
  notes: "Noodgeval",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  deductions: [makeDeduction()],
  deducted_cents: 5000,
  outstanding_cents: 45000,
  ...overrides,
});

const makeBalance = (overrides = {}) => ({
  staff_id: "staff-1",
  total_principal_cents: 50000,
  total_deducted_cents: 5000,
  outstanding_cents: 45000,
  loans: [makeLoan()],
  ...overrides,
});

const makeStaffList = () => ({
  data: [
    { id: "staff-1", full_name: "Jan Jansen", role: "Timmerman", email: "jan@example.com", hourly_rate_cents: 3500, active: true },
    { id: "staff-2", full_name: "Piet Pieters", role: "Metselaar", email: "piet@example.com", hourly_rate_cents: 4000, active: true },
  ],
  total: 2,
  page: 1,
  per_page: 100,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

describe("formatCents", () => {
  it("formats 50000 cents as euro amount", async () => {
    const { formatCents } = await import("@/lib/staff");
    const result = formatCents(50000);
    expect(result).toContain("500");
    expect(result).toContain("€");
  });

  it("formats 0 cents", async () => {
    const { formatCents } = await import("@/lib/staff");
    const result = formatCents(0);
    expect(result).toContain("0");
    expect(result).toContain("€");
  });
});

describe("LoansPage renders staff with balances", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders page heading Voorschotten", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    expect(screen.getByText(/voorschotten/i)).toBeInTheDocument();
  });

  it("shows staff names after load", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => {
      expect(screen.getByText("Jan Jansen")).toBeInTheDocument();
      expect(screen.getByText("Piet Pieters")).toBeInTheDocument();
    });
  });

  it("shows outstanding balance per staff member", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance({ outstanding_cents: 45000 }));

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => {
      const elements = screen.getAllByText(/450/);
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});

describe("LoansPage empty state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows empty state when no staff", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce({ data: [], total: 0, page: 1, per_page: 100 });

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => {
      expect(screen.getByText(/geen medewerkers/i)).toBeInTheDocument();
    });
  });
});

describe("LoansPage loan detail view", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows loan details when clicking a staff member", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => {
      expect(screen.getByText("Jan Jansen")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Jan Jansen"));
    });

    await waitFor(() => {
      expect(screen.getByText(/hoofdsom/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ingehouden/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/openstaand/i).length).toBeGreaterThan(0);
    });
  });

  it("shows Nieuw Voorschot button in expanded view", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText("Jan Jansen"));
    });

    await waitFor(() => {
      expect(screen.getByText(/nieuw voorschot/i)).toBeInTheDocument();
    });
  });

  it("shows Inhouding Toevoegen button per loan", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText("Jan Jansen"));
    });

    await waitFor(() => {
      expect(screen.getByText(/inhouding toevoegen/i)).toBeInTheDocument();
    });
  });

  it("shows loan notes", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText("Jan Jansen"));
    });

    await waitFor(() => {
      expect(screen.getByText("Noodgeval")).toBeInTheDocument();
    });
  });
});

describe("LoansPage issue loan form", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows form when Nieuw Voorschot is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByText("Jan Jansen")); });
    await waitFor(() => expect(screen.getByText(/nieuw voorschot/i)).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByText(/nieuw voorschot/i)); });

    await waitFor(() => {
      expect(screen.getByLabelText(/bedrag/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/datum/i)).toBeInTheDocument();
    });
  });

  it("submits and calls POST /loans/", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText("Jan Jansen")); });
    await waitFor(() => expect(screen.getByText(/nieuw voorschot/i)).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText(/nieuw voorschot/i)); });
    await waitFor(() => expect(screen.getByLabelText(/bedrag/i)).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/bedrag/i), { target: { value: "100" } });
      fireEvent.change(screen.getByLabelText(/datum/i), { target: { value: "2024-03-01" } });
    });

    apiFetch.mockResolvedValueOnce(makeLoan());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));
    });

    await waitFor(() => {
      const calls = apiFetch.mock.calls;
      const postCall = calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe("/loans/");
    });
  });
});

describe("LoansPage record deduction form", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows deduction form when Inhouding Toevoegen is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText("Jan Jansen")); });
    await waitFor(() => expect(screen.getByText(/inhouding toevoegen/i)).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByText(/inhouding toevoegen/i)); });

    await waitFor(() => {
      expect(screen.getByLabelText(/bedrag/i)).toBeInTheDocument();
    });
  });

  it("submits deduction and calls POST /loans/{id}/deductions", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeStaffList())
      .mockResolvedValue(makeBalance());

    const { default: LoansPage } = await import("@/app/dashboard/staff/loans/page");
    await act(async () => { render(<LoansPage />); });

    await waitFor(() => expect(screen.getByText("Jan Jansen")).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText("Jan Jansen")); });
    await waitFor(() => expect(screen.getByText(/inhouding toevoegen/i)).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText(/inhouding toevoegen/i)); });
    await waitFor(() => expect(screen.getByLabelText(/bedrag/i)).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/bedrag/i), { target: { value: "50" } });
      fireEvent.change(screen.getByLabelText(/datum/i), { target: { value: "2024-03-15" } });
    });

    apiFetch.mockResolvedValueOnce(makeDeduction());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));
    });

    await waitFor(() => {
      const calls = apiFetch.mock.calls;
      const postCall = calls.find((c) => c[1]?.method === "POST" && String(c[0]).includes("deductions"));
      expect(postCall).toBeDefined();
    });
  });
});
