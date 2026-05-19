import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Browser API mocks
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
  usePathname: vi.fn(() => "/dashboard/financials/income-statement"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// API mock
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
  code: overrides.code ?? "8000",
  name: overrides.name ?? "Omzet bouw",
  balance_cents: overrides.balance_cents ?? 500000,
  children: overrides.children ?? [],
});

const mockIncomeStatement = (overrides: Partial<{
  net_income_cents: number;
  is_profit: boolean;
  revenue_total: number;
  expenses_total: number;
}> = {}) => ({
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  revenue: {
    accounts: [mockAccountNode({ name: "Omzet bouw", balance_cents: 500000 })],
    total_cents: overrides.revenue_total ?? 500000,
  },
  expenses: {
    accounts: [mockAccountNode({ account_id: "acc-2", code: "4000", name: "Materiaalkosten", balance_cents: 200000 })],
    total_cents: overrides.expenses_total ?? 200000,
  },
  net_income_cents: overrides.net_income_cents ?? 300000,
  is_profit: overrides.is_profit ?? true,
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// formatCents unit tests
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("formats cents to Dutch euro notation", async () => {
    const { formatCents } = await import("@/lib/financials");
    // €5.000,00 — note non-breaking space between € and number in nl-NL
    const result = formatCents(500000);
    expect(result).toMatch(/5\.000,00/);
    expect(result).toMatch(/€/);
  });

  it("formats small amounts correctly", async () => {
    const { formatCents } = await import("@/lib/financials");
    const result = formatCents(12345);
    expect(result).toMatch(/123,45/);
  });

  it("formats zero correctly", async () => {
    const { formatCents } = await import("@/lib/financials");
    const result = formatCents(0);
    expect(result).toMatch(/0,00/);
  });
});

// ---------------------------------------------------------------------------
// fetchIncomeStatement unit tests
// ---------------------------------------------------------------------------

describe("fetchIncomeStatement", () => {
  it("calls apiFetch with correct path and params", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { fetchIncomeStatement } = await import("@/lib/financials");
    await fetchIncomeStatement("2024-01-01", "2024-12-31");

    expect(apiFetch).toHaveBeenCalledWith(
      "/financials/reports/income-statement?start_date=2024-01-01&end_date=2024-12-31"
    );
  });
});

// ---------------------------------------------------------------------------
// IncomeStatementPage — page title
// ---------------------------------------------------------------------------

describe("IncomeStatementPage title", () => {
  it("renders page title 'Winst- en Verliesrekening'", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    expect(screen.getByText("Winst- en Verliesrekening")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// IncomeStatementPage — loading state
// ---------------------------------------------------------------------------

describe("IncomeStatementPage loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// IncomeStatementPage — error state
// ---------------------------------------------------------------------------

describe("IncomeStatementPage error state", () => {
  it("shows error message on API failure", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// IncomeStatementPage — renders data
// ---------------------------------------------------------------------------

describe("IncomeStatementPage renders income statement data", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());
  });

  it("renders revenue section header 'Opbrengsten'", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(screen.getByText("Opbrengsten")).toBeInTheDocument();
    });
  });

  it("renders expenses section header 'Kosten'", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(screen.getByText("Kosten")).toBeInTheDocument();
    });
  });

  it("renders revenue account name", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(screen.getByText("Omzet bouw")).toBeInTheDocument();
    });
  });

  it("renders expense account name", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(screen.getByText("Materiaalkosten")).toBeInTheDocument();
    });
  });

  it("displays revenue total in Dutch currency format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement({ revenue_total: 500000 }));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      // €5.000,00
      expect(screen.getAllByText(/5\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it("displays expenses total in Dutch currency format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement({ expenses_total: 200000 }));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      // €2.000,00
      expect(screen.getAllByText(/2\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it("shows 'Netto Resultaat' label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(screen.getByText("Netto Resultaat")).toBeInTheDocument();
    });
  });

  it("shows net income amount in Dutch currency format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement({ net_income_cents: 300000 }));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      // €3.000,00
      expect(screen.getAllByText(/3\.000,00/).length).toBeGreaterThan(0);
    });
  });

  it("shows profit indicator with green styling when is_profit is true", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement({ is_profit: true }));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    const { container } = render(<IncomeStatementPage />);

    await waitFor(() => {
      // The net income element should have green color class
      const greenElements = container.querySelectorAll(".text-green-600, .text-green-700");
      expect(greenElements.length).toBeGreaterThan(0);
    });
  });

  it("shows loss indicator with red styling when is_profit is false", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      mockIncomeStatement({ net_income_cents: -50000, is_profit: false })
    );

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    const { container } = render(<IncomeStatementPage />);

    await waitFor(() => {
      const redElements = container.querySelectorAll(".text-red-600, .text-red-700");
      expect(redElements.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// IncomeStatementPage — period selector
// ---------------------------------------------------------------------------

describe("IncomeStatementPage period selector", () => {
  it("renders start_date and end_date inputs", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    const inputs = screen.getAllByRole("textbox");
    // At least 2 date inputs should be present (start + end)
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("fetches new data when period changes", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockIncomeStatement());

    const { default: IncomeStatementPage } = await import(
      "@/app/dashboard/financials/income-statement/page"
    );
    render(<IncomeStatementPage />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });

    // Change start date — find by input type=date or textbox
    const dateInputs = screen.getAllByRole("textbox");
    fireEvent.change(dateInputs[0], { target: { value: "2023-01-01" } });

    await waitFor(() => {
      // Should have been called at least twice: initial load + reload after date change
      expect(apiFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
