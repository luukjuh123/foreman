import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
  usePathname: vi.fn(() => "/dashboard/financials/cash-flow"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// recharts mock (jsdom cannot render SVGs)
// ---------------------------------------------------------------------------

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Cell: () => null,
  Legend: () => null,
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

const mockCashFlow = (overrides: Partial<{
  reconciles: boolean;
  net_income_cents: number;
  opening_cash_cents: number;
  ending_cash_cents: number;
  net_change_in_cash_cents: number;
}> = {}) => ({
  start_date: "2025-01-01",
  end_date: "2025-12-31",
  net_income_cents: overrides.net_income_cents ?? 30000,
  operating_activities: {
    lines: [
      { account_id: "uuid-1", code: "1300", name: "Debiteuren", change_cents: -5000 },
    ],
    total_cents: 25000,
  },
  investing_activities: {
    lines: [
      { account_id: "uuid-2", code: "0120", name: "Machines en installaties", change_cents: -50000 },
    ],
    total_cents: -50000,
  },
  financing_activities: {
    lines: [
      { account_id: "uuid-3", code: "1720", name: "Banklening", change_cents: 80000 },
    ],
    total_cents: 80000,
  },
  opening_cash_cents: overrides.opening_cash_cents ?? 0,
  ending_cash_cents: overrides.ending_cash_cents ?? 55000,
  net_change_in_cash_cents: overrides.net_change_in_cash_cents ?? 55000,
  reconciles: overrides.reconciles ?? true,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Test 1: page title
// ---------------------------------------------------------------------------

describe("CashFlowPage title", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders page title Kasstroomoverzicht", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    expect(screen.getByText(/kasstroomoverzicht/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 2: loading skeleton
// ---------------------------------------------------------------------------

describe("CashFlowPage loading state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows loading skeleton while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    expect(screen.getByTestId("cash-flow-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 3: error state
// ---------------------------------------------------------------------------

describe("CashFlowPage error state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Verbinding mislukt"));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByTestId("cash-flow-error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Test 4: 4 KPI cards with correct values
// ---------------------------------------------------------------------------

describe("CashFlowPage KPI cards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders 4 KPI cards: net income, operating, investing, financing", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("kpi-net-income")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-operating")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-investing")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-financing")).toBeInTheDocument();
    });
  });

  it("displays net income amount in Dutch format", async () => {
    const apiFetch = await getApiFetch();
    // net_income_cents = 30000 => €300,00
    apiFetch.mockResolvedValue(mockCashFlow({ net_income_cents: 30000 }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      const card = screen.getByTestId("kpi-net-income");
      expect(card).toHaveTextContent("300");
    });
  });
});

// ---------------------------------------------------------------------------
// Test 5: reconciliation indicator
// ---------------------------------------------------------------------------

describe("CashFlowPage reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows Gereconcilieerd indicator when reconciles is true", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ reconciles: true }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      const el = screen.getByTestId("reconciliation-status");
      expect(el).toBeInTheDocument();
      expect(el.textContent).toMatch(/gereconcilieerd|klopt|ok|correct|aansluiting/i);
    });
  });

  it("shows error indicator when reconciles is false", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ reconciles: false }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      const el = screen.getByTestId("reconciliation-status");
      expect(el).toBeInTheDocument();
      expect(el.textContent).toMatch(/fout|mismatch|verschil|niet/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Test 6: chart container renders
// ---------------------------------------------------------------------------

describe("CashFlowPage chart", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders chart container", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("chart-container")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Test 7: detailed line items per section
// ---------------------------------------------------------------------------

describe("CashFlowPage line items", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows detailed line items per activity section", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      // Operating section line
      expect(screen.getByText("Debiteuren")).toBeInTheDocument();
      // Investing section line
      expect(screen.getByText("Machines en installaties")).toBeInTheDocument();
      // Financing section line
      expect(screen.getByText("Banklening")).toBeInTheDocument();
    });
  });

  it("renders section headers for all three activity sections", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      // Multiple elements may match (KPI card label + section header) — use getAllByText
      expect(screen.getAllByText(/operationele activiteiten/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/investeringsactiviteiten/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/financieringsactiviteiten/i).length).toBeGreaterThan(0);
    });
  });
});
