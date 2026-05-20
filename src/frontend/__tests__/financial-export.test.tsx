import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// matchMedia stub (jsdom has no implementation)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Next.js mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/financials/export"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// apiFetch mock
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAccountNode = (overrides: Partial<{
  account_id: string;
  code: string;
  name: string;
  balance_cents: number;
  children: unknown[];
}> = {}) => ({
  account_id: overrides.account_id ?? "acc-1",
  code: overrides.code ?? "1000",
  name: overrides.name ?? "Kas",
  balance_cents: overrides.balance_cents ?? 100000,
  children: overrides.children ?? [],
});

const mockBalanceSheet = () => ({
  as_of: "2024-12-31",
  assets: {
    accounts: [mockAccountNode({ code: "1000", name: "Kas", balance_cents: 500000 })],
    total_cents: 500000,
  },
  liabilities: {
    accounts: [mockAccountNode({ account_id: "acc-2", code: "2000", name: "Crediteuren", balance_cents: 200000 })],
    total_cents: 200000,
  },
  equity: {
    accounts: [mockAccountNode({ account_id: "acc-3", code: "3000", name: "Eigen vermogen", balance_cents: 300000 })],
    total_cents: 300000,
  },
  retained_earnings_cents: 0,
  total_liabilities_and_equity_cents: 500000,
  is_balanced: true,
});

const mockIncomeStatement = () => ({
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  revenue: {
    accounts: [mockAccountNode({ account_id: "acc-4", code: "8000", name: "Omzet bouw", balance_cents: 1000000 })],
    total_cents: 1000000,
  },
  expenses: {
    accounts: [mockAccountNode({ account_id: "acc-5", code: "4000", name: "Materialen", balance_cents: 400000 })],
    total_cents: 400000,
  },
  net_income_cents: 600000,
  is_profit: true,
});

const mockCashFlow = () => ({
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  net_income_cents: 600000,
  operating_activities: {
    lines: [{ account_id: "acc-1", code: "1000", name: "Nettowinst", change_cents: 600000 }],
    total_cents: 600000,
  },
  investing_activities: {
    lines: [],
    total_cents: 0,
  },
  financing_activities: {
    lines: [],
    total_cents: 0,
  },
  opening_cash_cents: 100000,
  ending_cash_cents: 700000,
  net_change_in_cash_cents: 600000,
  reconciles: true,
});

// ---------------------------------------------------------------------------
// Helper to get the mocked apiFetch
// ---------------------------------------------------------------------------

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// flattenAccountsToCSV unit tests
// ---------------------------------------------------------------------------

describe("flattenAccountsToCSV", () => {
  it("flattens a flat list of accounts into CSV rows", async () => {
    const { flattenAccountsToCSV } = await import("@/lib/financials");
    const accounts = [
      mockAccountNode({ code: "1000", name: "Kas", balance_cents: 500000 }),
      mockAccountNode({ account_id: "acc-2", code: "1010", name: "Bank", balance_cents: 300000 }),
    ];
    const rows = flattenAccountsToCSV(accounts, "Activa");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("1000");
    expect(rows[0]).toContain("Kas");
    expect(rows[0]).toContain("Activa");
  });

  it("recursively flattens nested child accounts with indentation", async () => {
    const { flattenAccountsToCSV } = await import("@/lib/financials");
    const child = mockAccountNode({ account_id: "acc-child", code: "1001", name: "Kas filiaal", balance_cents: 100000 });
    const parent = mockAccountNode({ code: "1000", name: "Kas", balance_cents: 600000, children: [child] });
    const rows = flattenAccountsToCSV([parent], "Activa");
    // parent row + child row
    expect(rows).toHaveLength(2);
    // child row should have deeper indentation (leading spaces)
    expect(rows[1][0]).toContain("1001");
    expect(rows[1][0].startsWith("  ")).toBe(true);
  });

  it("returns empty array for empty accounts list", async () => {
    const { flattenAccountsToCSV } = await import("@/lib/financials");
    expect(flattenAccountsToCSV([], "Activa")).toHaveLength(0);
  });

  it("includes formatted euro amount in last column", async () => {
    const { flattenAccountsToCSV } = await import("@/lib/financials");
    const accounts = [mockAccountNode({ balance_cents: 500000 })];
    const rows = flattenAccountsToCSV(accounts, "Activa");
    // 500000 cents = €5.000,00
    expect(rows[0][3]).toMatch(/5/);
    expect(rows[0][3]).toMatch(/000/);
  });
});

// ---------------------------------------------------------------------------
// ExportPage — renders page title
// ---------------------------------------------------------------------------

describe("ExportPage title", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders page title Rapporten Exporteren", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    expect(screen.getByText(/rapporten exporteren/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ExportPage — report type selector
// ---------------------------------------------------------------------------

describe("ExportPage report type selector", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows report type selector with 3 options", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toMatch(/balans/i);
    expect(options[1].textContent).toMatch(/winst.*verlies/i);
    expect(options[2].textContent).toMatch(/kasstroom/i);
  });
});

// ---------------------------------------------------------------------------
// ExportPage — date inputs
// ---------------------------------------------------------------------------

describe("ExportPage date inputs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows date input for balance sheet (as_of)", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    // Balance sheet selected by default — should show an as_of date input
    const dateInputs = document.querySelectorAll("input[type='date']");
    expect(dateInputs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows start_date and end_date inputs for income statement", async () => {
    const apiFetch = await getApiFetch();
    // Return balance sheet for all fetches (the control UI doesn't depend on data type)
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    // Switch to income statement — only the controls change, not the data display
    // (data is cleared and refetched, but we just check the control inputs)
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "income-statement" } });

    // The controls immediately show 2 date inputs when type is not balance-sheet
    const dateInputs = document.querySelectorAll("input[type='date']");
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// ExportPage — export buttons
// ---------------------------------------------------------------------------

describe("ExportPage export buttons", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows CSV export button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    expect(screen.getByText(/csv/i)).toBeInTheDocument();
  });

  it("shows PDF export button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    expect(screen.getByText(/pdf/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ExportPage — CSV download triggered
// ---------------------------------------------------------------------------

describe("ExportPage CSV download", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    createObjectURLSpy = vi.fn(() => "blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();

    Object.defineProperty(window, "URL", {
      writable: true,
      value: { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy },
    });

    // Spy on HTMLAnchorElement.prototype.click so we don't need to intercept createElement
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers CSV download when CSV button is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockBalanceSheet());

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    const csvButton = screen.getByRole("button", { name: /csv/i });
    await act(async () => {
      fireEvent.click(csvButton);
    });

    // Should have created a blob URL and triggered click
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ExportPage — error state on fetch failure
// ---------------------------------------------------------------------------

describe("ExportPage error state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows error message when fetch fails during export", async () => {
    const apiFetch = await getApiFetch();
    // First call (initial load for balance sheet) succeeds, then on export it fails
    apiFetch
      .mockResolvedValueOnce(mockBalanceSheet())
      .mockRejectedValueOnce(new Error("Exportfout opgetreden"));

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );
    await act(async () => {
      render(<ExportPage />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/laden/i)).not.toBeInTheDocument();
    });

    const csvButton = screen.getByRole("button", { name: /csv/i });
    await act(async () => {
      fireEvent.click(csvButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/exportfout opgetreden/i)).toBeInTheDocument();
    });
  });
});
