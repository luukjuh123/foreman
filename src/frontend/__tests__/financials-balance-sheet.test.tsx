import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock window.matchMedia
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
  usePathname: vi.fn(() => "/dashboard/financials/balance-sheet"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Unit tests: formatCents
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("formats zero cents as €0,00", async () => {
    const { formatCents } = await import("@/lib/financials");
    expect(formatCents(0)).toBe("€\u00a00,00");
  });

  it("formats 100 cents as €1,00", async () => {
    const { formatCents } = await import("@/lib/financials");
    expect(formatCents(100)).toBe("€\u00a01,00");
  });

  it("formats 123456 cents as €1.234,56 (Dutch locale)", async () => {
    const { formatCents } = await import("@/lib/financials");
    const result = formatCents(123456);
    expect(result).toContain("1.234");
    expect(result).toContain("56");
    expect(result).toContain("€");
  });

  it("formats negative cents with minus sign", async () => {
    const { formatCents } = await import("@/lib/financials");
    const result = formatCents(-100);
    expect(result).toContain("-");
    expect(result).toContain("€");
  });
});

// ---------------------------------------------------------------------------
// Unit tests: fetchBalanceSheet
// ---------------------------------------------------------------------------

describe("fetchBalanceSheet", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls apiFetch with correct path", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ as_of: "2024-01-01", assets: { accounts: [], total_cents: 0 }, liabilities: { accounts: [], total_cents: 0 }, equity: { accounts: [], total_cents: 0 }, retained_earnings_cents: 0, total_liabilities_and_equity_cents: 0, is_balanced: true }),
    }));

    const { fetchBalanceSheet } = await import("@/lib/financials");
    const { apiFetch } = await import("@/lib/api");

    await fetchBalanceSheet("2024-01-01");

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("balance-sheet")
    );
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("2024-01-01")
    );
  });
});

// ---------------------------------------------------------------------------
// Balance sheet page tests
// ---------------------------------------------------------------------------

const mockBalanceSheetData = {
  as_of: "2024-01-01",
  assets: {
    accounts: [
      {
        account_id: "a1",
        code: "100",
        name: "Vlottende activa",
        balance_cents: 500000,
        children: [
          { account_id: "a1a", code: "110", name: "Kas", balance_cents: 200000, children: [] },
          { account_id: "a1b", code: "120", name: "Bank", balance_cents: 300000, children: [] },
        ],
      },
      {
        account_id: "a2",
        code: "200",
        name: "Vaste activa",
        balance_cents: 1000000,
        children: [],
      },
    ],
    total_cents: 1500000,
  },
  liabilities: {
    accounts: [
      {
        account_id: "l1",
        code: "300",
        name: "Kortlopende schulden",
        balance_cents: 300000,
        children: [],
      },
    ],
    total_cents: 300000,
  },
  equity: {
    accounts: [
      {
        account_id: "e1",
        code: "500",
        name: "Aandelenkapitaal",
        balance_cents: 1000000,
        children: [],
      },
    ],
    total_cents: 1000000,
  },
  retained_earnings_cents: 200000,
  total_liabilities_and_equity_cents: 1500000,
  is_balanced: true,
};

describe("BalanceSheetPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders page title 'Balans'", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByText("Balans")).toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockReturnValue(new Promise(() => {})),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    render(<BalanceSheetPage />);

    expect(screen.getByTestId("balance-sheet-loading")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByTestId("balance-sheet-error")).toBeInTheDocument();
  });

  it("renders Activa section heading", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("renders Passiva section heading", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByText("Passiva")).toBeInTheDocument();
  });

  it("renders Eigen Vermogen section heading", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByText("Eigen Vermogen")).toBeInTheDocument();
  });

  it("displays assets total in Dutch currency format", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    // total_cents: 1500000 = €15.000,00
    const activaTotal = screen.getByTestId("activa-total");
    expect(activaTotal).toHaveTextContent("15.000");
    expect(activaTotal).toHaveTextContent("€");
  });

  it("shows balanced indicator when is_balanced is true", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByTestId("balance-check")).toBeInTheDocument();
    expect(screen.getByTestId("balance-check")).toHaveTextContent(/balans klopt/i);
  });

  it("shows unbalanced indicator when is_balanced is false", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue({ ...mockBalanceSheetData, is_balanced: false }),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByTestId("balance-check")).toHaveTextContent(/niet in balans/i);
  });

  it("renders account names in the tree", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByText("Vlottende activa")).toBeInTheDocument();
    expect(screen.getByText("Vaste activa")).toBeInTheDocument();
    expect(screen.getByText("Kortlopende schulden")).toBeInTheDocument();
    expect(screen.getByText("Aandelenkapitaal")).toBeInTheDocument();
  });

  it("shows Ingehouden Winst row", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    expect(screen.getByText(/ingehouden winst/i)).toBeInTheDocument();
  });

  it("expands parent account to show children when toggled", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    // Children should not be visible initially
    expect(screen.queryByText("Kas")).not.toBeInTheDocument();

    // Click parent to expand
    fireEvent.click(screen.getByText("Vlottende activa"));

    await waitFor(() => {
      expect(screen.getByText("Kas")).toBeInTheDocument();
      expect(screen.getByText("Bank")).toBeInTheDocument();
    });
  });

  it("collapses expanded account when toggled again", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    // Expand
    fireEvent.click(screen.getByText("Vlottende activa"));
    await waitFor(() => expect(screen.getByText("Kas")).toBeInTheDocument());

    // Collapse
    fireEvent.click(screen.getByText("Vlottende activa"));
    await waitFor(() => expect(screen.queryByText("Kas")).not.toBeInTheDocument());
  });

  it("renders date picker input", async () => {
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockResolvedValue(mockBalanceSheetData),
      formatCents: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));

    const { default: BalanceSheetPage } = await import("@/app/dashboard/financials/balance-sheet/page");

    await act(async () => {
      render(<BalanceSheetPage />);
    });

    const dateInput = screen.getByTestId("as-of-date-input");
    expect(dateInput).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Financials index page tests
// ---------------------------------------------------------------------------

describe("FinancialsPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Boekhouding heading", async () => {
    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    render(<FinancialsPage />);

    expect(screen.getByText("Boekhouding")).toBeInTheDocument();
  });

  it("renders link to balance sheet page", async () => {
    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    render(<FinancialsPage />);

    const balansLink = screen.getByRole("link", { name: /balans/i });
    expect(balansLink).toHaveAttribute("href", "/dashboard/financials/balance-sheet");
  });

  it("renders Winst & Verlies card", async () => {
    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    render(<FinancialsPage />);

    expect(screen.getByText(/winst & verlies/i)).toBeInTheDocument();
  });

  it("renders Kasstroom card", async () => {
    const { default: FinancialsPage } = await import("@/app/dashboard/financials/page");

    render(<FinancialsPage />);

    expect(screen.getByText(/kasstroom/i)).toBeInTheDocument();
  });
});
