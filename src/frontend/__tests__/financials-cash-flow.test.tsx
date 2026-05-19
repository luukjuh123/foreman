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
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  Legend: () => <div />,
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
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  net_income_cents: overrides.net_income_cents ?? 500000,
  operating_activities: {
    lines: [
      { account_id: "acc-1", code: "1000", name: "Nettowinst", change_cents: 500000 },
      { account_id: "acc-2", code: "1010", name: "Afschrijvingen", change_cents: 150000 },
    ],
    total_cents: 650000,
  },
  investing_activities: {
    lines: [
      { account_id: "acc-3", code: "2000", name: "Aankoop machines", change_cents: -300000 },
    ],
    total_cents: -300000,
  },
  financing_activities: {
    lines: [
      { account_id: "acc-4", code: "3000", name: "Lening opgenomen", change_cents: 200000 },
    ],
    total_cents: 200000,
  },
  opening_cash_cents: overrides.opening_cash_cents ?? 100000,
  ending_cash_cents: overrides.ending_cash_cents ?? 650000,
  net_change_in_cash_cents: overrides.net_change_in_cash_cents ?? 550000,
  reconciles: overrides.reconciles ?? true,
});

// ---------------------------------------------------------------------------
// Helper to get the mocked apiFetch
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
    // 60500 cents = €605,00
    expect(formatCents(60500)).toMatch(/605/);
    expect(formatCents(60500)).toMatch(/,00/);
  });

  it("formats large amounts with thousands separator", async () => {
    const { formatCents } = await import("@/lib/financials");
    // 500000 cents = €5.000,00
    expect(formatCents(500000)).toMatch(/5/);
    expect(formatCents(500000)).toMatch(/000/);
    expect(formatCents(500000)).toMatch(/,00/);
  });

  it("formats zero correctly", async () => {
    const { formatCents } = await import("@/lib/financials");
    expect(formatCents(0)).toMatch(/0,00/);
  });

  it("formats negative values", async () => {
    const { formatCents } = await import("@/lib/financials");
    expect(formatCents(-300000)).toMatch(/-/);
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — page title
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
// CashFlowPage — loading state
// ---------------------------------------------------------------------------

describe("CashFlowPage loading state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — error state
// ---------------------------------------------------------------------------

describe("CashFlowPage error state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows error message on API failure", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Verbinding mislukt"));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    render(<CashFlowPage />);

    await waitFor(() => {
      expect(screen.getByText(/verbinding mislukt/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — three activity sections
// ---------------------------------------------------------------------------

describe("CashFlowPage activity sections", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Operationele Activiteiten section", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/operationele activiteiten/i)).toBeInTheDocument();
    });
  });

  it("renders Investeringsactiviteiten section", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/investeringsactiviteiten/i)).toBeInTheDocument();
    });
  });

  it("renders Financieringsactiviteiten section", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/financieringsactiviteiten/i)).toBeInTheDocument();
    });
  });

  it("renders account line names within sections", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Nettowinst")).toBeInTheDocument();
      expect(screen.getByText("Afschrijvingen")).toBeInTheDocument();
      expect(screen.getByText("Aankoop machines")).toBeInTheDocument();
      expect(screen.getByText("Lening opgenomen")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — cash summary cards
// ---------------------------------------------------------------------------

describe("CashFlowPage cash summary cards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Opening kas card", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/opening kas/i)).toBeInTheDocument();
    });
  });

  it("renders Netto wijziging card", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/netto wijziging/i)).toBeInTheDocument();
    });
  });

  it("renders Slotstand kas card", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow());

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/slotstand kas/i)).toBeInTheDocument();
    });
  });

  it("displays opening cash amount in Dutch format", async () => {
    const apiFetch = await getApiFetch();
    // opening_cash_cents = 100000 => €1.000,00
    apiFetch.mockResolvedValue(mockCashFlow({ opening_cash_cents: 100000 }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      // Should show 1.000,00 or similar Dutch format
      expect(screen.getAllByText(/1\.000/).length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// CashFlowPage — reconciliation status
// ---------------------------------------------------------------------------

describe("CashFlowPage reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows reconciliation OK indicator when reconciles is true", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ reconciles: true }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      // Should show some reconciliation OK text
      const el = screen.getByTestId("reconciliation-status");
      expect(el).toBeInTheDocument();
      expect(el.textContent).toMatch(/klopt|ok|correct|aansluiting/i);
    });
  });

  it("shows reconciliation error indicator when reconciles is false", async () => {
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
// CashFlowPage — chart rendered
// ---------------------------------------------------------------------------

describe("CashFlowPage chart", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders the bar chart container", async () => {
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
// CashFlowPage — Dutch currency display
// ---------------------------------------------------------------------------

describe("CashFlowPage Dutch currency format", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("displays amounts in Dutch euro format with comma decimal separator", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockCashFlow({ ending_cash_cents: 650000 }));

    const { default: CashFlowPage } = await import(
      "@/app/dashboard/financials/cash-flow/page"
    );
    await act(async () => {
      render(<CashFlowPage />);
    });

    await waitFor(() => {
      // ending_cash_cents = 650000 => €6.500,00
      expect(screen.getAllByText(/6\.500/).length).toBeGreaterThan(0);
    });
  });
});
