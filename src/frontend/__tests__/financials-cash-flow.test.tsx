import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Browser API mocks (recharts uses ResizeObserver)
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

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

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
// API mock
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// recharts mock (avoids SVG rendering issues in jsdom)
// ---------------------------------------------------------------------------

vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Cell: () => null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCashFlowLine = (overrides: Partial<{
  account_id: string;
  code: string;
  name: string;
  change_cents: number;
}> = {}) => ({
  account_id: overrides.account_id ?? "acc-1",
  code: overrides.code ?? "1000",
  name: overrides.name ?? "Debiteuren",
  change_cents: overrides.change_cents ?? -50000,
});

const mockCashFlow = (overrides: Partial<{
  net_income_cents: number;
  operating_total: number;
  investing_total: number;
  financing_total: number;
  opening_cash_cents: number;
  net_change_in_cash_cents: number;
  ending_cash_cents: number;
  reconciles: boolean;
}> = {}) => ({
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  net_income_cents: overrides.net_income_cents ?? 300000,
  operating_activities: {
    lines: [mockCashFlowLine({ name: "Debiteuren", change_cents: -50000 })],
    total_cents: overrides.operating_total ?? 250000,
  },
  investing_activities: {
    lines: [mockCashFlowLine({ account_id: "acc-2", code: "0100", name: "Machines", change_cents: -100000 })],
    total_cents: overrides.investing_total ?? -100000,
  },
  financing_activities: {
    lines: [mockCashFlowLine({ account_id: "acc-3", code: "2500", name: "Banklening", change_cents: 50000 })],
    total_cents: overrides.financing_total ?? 50000,
  },
  opening_cash_cents: overrides.opening_cash_cents ?? 100000,
  net_change_in_cash_cents: overrides.net_change_in_cash_cents ?? 200000,
  ending_cash_cents: overrides.ending_cash_cents ?? 300000,
  reconciles: overrides.reconciles ?? true,
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// fetchCashFlow unit tests
// ---------------------------------------------------------------------------

describe("fetchCashFlow", () => {
  it("calls apiFetch with correct path and params", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { fetchCashFlow } = await import("@/lib/financials");
    await fetchCashFlow("2024-01-01", "2024-12-31");

    expect(apiFetch).toHaveBeenCalledWith(
      "/financials/reports/cash-flow?start_date=2024-01-01&end_date=2024-12-31"
    );
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — loading state
// ---------------------------------------------------------------------------

describe("CashFlowPage loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("renders page title 'Kasstroomoverzicht'", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    expect(screen.getByText("Kasstroomoverzicht")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — error state
// ---------------------------------------------------------------------------

describe("CashFlowPage error state", () => {
  it("shows error message on API failure", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — KPI cards
// ---------------------------------------------------------------------------

describe("CashFlowPage KPI cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Netto inkomen' KPI label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ net_income_cents: 300000 }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Netto inkomen")).toBeInTheDocument();
    });
  });

  it("renders 'Operationeel' KPI label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Operationeel")).toBeInTheDocument();
    });
  });

  it("renders 'Investering' KPI label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Investering")).toBeInTheDocument();
    });
  });

  it("renders 'Financiering' KPI label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Financiering")).toBeInTheDocument();
    });
  });

  it("displays net income amount in Dutch currency format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ net_income_cents: 300000 }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      // €3.000,00
      expect(screen.getAllByText(/3\.000,00/).length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — activity sections
// ---------------------------------------------------------------------------

describe("CashFlowPage activity sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Operationele activiteiten' section header", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Operationele activiteiten")).toBeInTheDocument();
    });
  });

  it("renders 'Investeringsactiviteiten' section header", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Investeringsactiviteiten")).toBeInTheDocument();
    });
  });

  it("renders 'Financieringsactiviteiten' section header", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Financieringsactiviteiten")).toBeInTheDocument();
    });
  });

  it("renders operating activity line name 'Debiteuren'", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Debiteuren")).toBeInTheDocument();
    });
  });

  it("renders investing activity line name 'Machines'", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Machines")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — cash summary footer
// ---------------------------------------------------------------------------

describe("CashFlowPage cash summary footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Beginstand kas' label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Beginstand kas")).toBeInTheDocument();
    });
  });

  it("renders 'Eindstand kas' label", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Eindstand kas")).toBeInTheDocument();
    });
  });

  it("shows reconciliation badge 'Klopt' when reconciles is true", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ reconciles: true }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Klopt")).toBeInTheDocument();
    });
  });

  it("shows reconciliation badge 'Afwijking' when reconciles is false", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ reconciles: false }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText("Afwijking")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — date range controls
// ---------------------------------------------------------------------------

describe("CashFlowPage date range controls", () => {
  it("renders start and end date inputs", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });
});
