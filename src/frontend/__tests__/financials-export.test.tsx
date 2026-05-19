import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock window.matchMedia (not available in jsdom)
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
  usePathname: vi.fn(() => "/dashboard/financials/export"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// export-utils: downloadCSV
// ---------------------------------------------------------------------------

describe("downloadCSV", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let appendChildSpy: ReturnType<typeof vi.fn>;
  let removeChildSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();
    appendChildSpy = vi.fn();
    removeChildSpy = vi.fn();

    Object.defineProperty(window, "URL", {
      writable: true,
      value: { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy },
    });

    vi.spyOn(document.body, "appendChild").mockImplementation(appendChildSpy);
    vi.spyOn(document.body, "removeChild").mockImplementation(removeChildSpy);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = Object.create(HTMLAnchorElement.prototype) as HTMLAnchorElement;
      Object.defineProperties(el, {
        tagName: { value: tag.toUpperCase() },
        href: { writable: true, value: "" },
        download: { writable: true, value: "" },
        click: { value: clickSpy },
        style: { value: {} },
      });
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates a Blob and triggers download with correct filename", async () => {
    const { downloadCSV } = await import("@/lib/export-utils");
    downloadCSV("test.csv", ["Kolom1", "Kolom2"], [["A", "B"]]);
    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    const blob: Blob = createObjectURLSpy.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
  });

  it("CSV content includes headers and rows", async () => {
    // Intercept Blob constructor to capture the content string
    let capturedContent = "";
    const OrigBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob" as never).mockImplementationOnce(
      (parts: BlobPart[], _opts?: BlobPropertyBag) => {
        capturedContent = (parts as string[]).join("");
        return new OrigBlob(parts, _opts);
      }
    );

    const { downloadCSV } = await import("@/lib/export-utils");
    downloadCSV("report.csv", ["Naam", "Saldo"], [["Kas", "1000"], ["Bank", "5000"]]);

    expect(capturedContent).toContain("Naam");
    expect(capturedContent).toContain("Saldo");
    expect(capturedContent).toContain("Kas");
    expect(capturedContent).toContain("1000");
    expect(capturedContent).toContain("Bank");
    expect(capturedContent).toContain("5000");
  });

  it("quotes values that contain commas", async () => {
    let capturedContent = "";
    const OrigBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob" as never).mockImplementationOnce(
      (parts: BlobPart[], _opts?: BlobPropertyBag) => {
        capturedContent = (parts as string[]).join("");
        return new OrigBlob(parts, _opts);
      }
    );

    const { downloadCSV } = await import("@/lib/export-utils");
    downloadCSV("report.csv", ["Naam"], [['Kosten, diverse', "200"]]);

    expect(capturedContent).toContain('"Kosten, diverse"');
  });

  it("includes UTF-8 BOM for Excel compatibility", async () => {
    let capturedContent = "";
    const OrigBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob" as never).mockImplementationOnce(
      (parts: BlobPart[], _opts?: BlobPropertyBag) => {
        capturedContent = (parts as string[]).join("");
        return new OrigBlob(parts, _opts);
      }
    );

    const { downloadCSV } = await import("@/lib/export-utils");
    downloadCSV("report.csv", ["Header"], [["Value"]]);

    // UTF-8 BOM is the Unicode character U+FEFF (zero-width no-break space)
    expect(capturedContent.charCodeAt(0)).toBe(0xfeff);
  });
});

// ---------------------------------------------------------------------------
// export-utils: printToPDF
// ---------------------------------------------------------------------------

describe("printToPDF", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("opens a new window and calls print", async () => {
    const mockPrint = vi.fn();
    const mockWrite = vi.fn();
    const mockClose = vi.fn();
    const mockOpen = vi.fn().mockReturnValue({
      document: { write: mockWrite, close: mockClose },
      print: mockPrint,
    });
    vi.spyOn(window, "open").mockImplementation(mockOpen);

    const { printToPDF } = await import("@/lib/export-utils");
    printToPDF("Balans", "<table><tr><td>Test</td></tr></table>");

    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockWrite).toHaveBeenCalledOnce();
    const writtenHtml: string = mockWrite.mock.calls[0][0];
    expect(writtenHtml).toContain("Balans");
    expect(writtenHtml).toContain("Foreman");
    expect(writtenHtml).toContain("<table>");
    expect(mockPrint).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// financial-export: balanceSheetToCSV
// ---------------------------------------------------------------------------

describe("balanceSheetToCSV", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("flattens account tree into rows with Code, Naam, Saldo", async () => {
    const { balanceSheetToCSV } = await import("@/lib/financial-export");
    const data = {
      as_of: "2024-12-31",
      assets: {
        accounts: [
          {
            account_id: "1",
            code: "1000",
            name: "Kas",
            balance_cents: 150000,
            children: [],
          },
          {
            account_id: "2",
            code: "1100",
            name: "Bank",
            balance_cents: 300000,
            children: [
              {
                account_id: "3",
                code: "1110",
                name: "Rekening-courant",
                balance_cents: 200000,
                children: [],
              },
            ],
          },
        ],
        total_cents: 450000,
      },
      liabilities: { accounts: [], total_cents: 0 },
      equity: { accounts: [], total_cents: 0 },
      retained_earnings_cents: 0,
      total_liabilities_and_equity_cents: 450000,
      is_balanced: true,
    };

    const result = balanceSheetToCSV(data);

    expect(result.headers).toEqual(["Code", "Naam", "Saldo (€)"]);
    // Should include section header + accounts
    const names = result.rows.map((r) => r[1]);
    expect(names).toContain("Kas");
    expect(names).toContain("Bank");
    expect(names).toContain("Rekening-courant");
  });

  it("formats balance_cents as euros", async () => {
    const { balanceSheetToCSV } = await import("@/lib/financial-export");
    const data = {
      as_of: "2024-12-31",
      assets: {
        accounts: [
          { account_id: "1", code: "1000", name: "Kas", balance_cents: 123456, children: [] },
        ],
        total_cents: 123456,
      },
      liabilities: { accounts: [], total_cents: 0 },
      equity: { accounts: [], total_cents: 0 },
      retained_earnings_cents: 0,
      total_liabilities_and_equity_cents: 123456,
      is_balanced: true,
    };

    const result = balanceSheetToCSV(data);
    const kasRow = result.rows.find((r) => r[1] === "Kas");
    expect(kasRow).toBeDefined();
    // formatted amount should contain 1234 (1234.56 formatted)
    expect(kasRow![2]).toContain("1.234");
  });
});

// ---------------------------------------------------------------------------
// financial-export: incomeStatementToCSV
// ---------------------------------------------------------------------------

describe("incomeStatementToCSV", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("produces rows for revenue and expense accounts", async () => {
    const { incomeStatementToCSV } = await import("@/lib/financial-export");
    const data = {
      start_date: "2024-01-01",
      end_date: "2024-12-31",
      revenue: {
        accounts: [
          { account_id: "r1", code: "8000", name: "Omzet", balance_cents: 500000, children: [] },
        ],
        total_cents: 500000,
      },
      expenses: {
        accounts: [
          { account_id: "e1", code: "4000", name: "Personeelskosten", balance_cents: 200000, children: [] },
        ],
        total_cents: 200000,
      },
      net_income_cents: 300000,
      is_profit: true,
    };

    const result = incomeStatementToCSV(data);

    expect(result.headers).toEqual(["Code", "Naam", "Bedrag (€)"]);
    const names = result.rows.map((r) => r[1]);
    expect(names).toContain("Omzet");
    expect(names).toContain("Personeelskosten");
  });
});

// ---------------------------------------------------------------------------
// financial-export: cashFlowToCSV
// ---------------------------------------------------------------------------

describe("cashFlowToCSV", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("produces rows for operating, investing, financing activities", async () => {
    const { cashFlowToCSV } = await import("@/lib/financial-export");
    const data = {
      start_date: "2024-01-01",
      end_date: "2024-12-31",
      net_income_cents: 300000,
      operating_activities: {
        lines: [
          { account_id: "o1", code: "1000", name: "Kas uit operaties", change_cents: 300000 },
        ],
        total_cents: 300000,
      },
      investing_activities: {
        lines: [
          { account_id: "i1", code: "2000", name: "Aankoop machines", change_cents: -100000 },
        ],
        total_cents: -100000,
      },
      financing_activities: {
        lines: [],
        total_cents: 0,
      },
      opening_cash_cents: 50000,
      ending_cash_cents: 250000,
      net_change_in_cash_cents: 200000,
      reconciles: true,
    };

    const result = cashFlowToCSV(data);

    expect(result.headers).toEqual(["Code", "Naam", "Mutatie (€)"]);
    const names = result.rows.map((r) => r[1]);
    expect(names).toContain("Kas uit operaties");
    expect(names).toContain("Aankoop machines");
  });
});

// ---------------------------------------------------------------------------
// Export page rendering
// ---------------------------------------------------------------------------

describe("FinancialsExportPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("renders title 'Financiële Rapporten Exporteren'", async () => {
    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    expect(
      screen.getByText(/Financiële Rapporten Exporteren/i)
    ).toBeInTheDocument();
  });

  it("renders three report sections: Balans, Winst & Verlies, Kasstroom", async () => {
    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    expect(screen.getByText(/Balans/i)).toBeInTheDocument();
    expect(screen.getByText(/Winst & Verlies/i)).toBeInTheDocument();
    expect(screen.getByText(/Kasstroom/i)).toBeInTheDocument();
  });

  it("renders CSV and PDF download buttons for each section", async () => {
    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    const csvButtons = screen.getAllByText(/CSV Downloaden/i);
    const pdfButtons = screen.getAllByText(/PDF Downloaden/i);
    expect(csvButtons.length).toBe(3);
    expect(pdfButtons.length).toBe(3);
  });

  it("CSV download button for Balans triggers downloadCSV on click", async () => {
    const downloadCSVMock = vi.fn();
    const fetchBalanceSheetMock = vi.fn().mockResolvedValue({
      as_of: "2024-12-31",
      assets: { accounts: [], total_cents: 0 },
      liabilities: { accounts: [], total_cents: 0 },
      equity: { accounts: [], total_cents: 0 },
      retained_earnings_cents: 0,
      total_liabilities_and_equity_cents: 0,
      is_balanced: true,
    });

    vi.doMock("@/lib/export-utils", () => ({
      downloadCSV: downloadCSVMock,
      printToPDF: vi.fn(),
    }));
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: fetchBalanceSheetMock,
      fetchIncomeStatement: vi.fn(),
      fetchCashFlow: vi.fn(),
      formatCents: vi.fn((c: number) => `€${c}`),
    }));
    vi.doMock("@/lib/financial-export", () => ({
      balanceSheetToCSV: vi.fn().mockReturnValue({ headers: ["H"], rows: [["R"]] }),
      balanceSheetToHTML: vi.fn().mockReturnValue("<p>html</p>"),
      incomeStatementToCSV: vi.fn().mockReturnValue({ headers: ["H"], rows: [] }),
      incomeStatementToHTML: vi.fn().mockReturnValue("<p>html</p>"),
      cashFlowToCSV: vi.fn().mockReturnValue({ headers: ["H"], rows: [] }),
      cashFlowToHTML: vi.fn().mockReturnValue("<p>html</p>"),
    }));

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    const csvButtons = screen.getAllByText(/CSV Downloaden/i);
    await act(async () => {
      await userEvent.click(csvButtons[0]);
    });

    expect(fetchBalanceSheetMock).toHaveBeenCalledOnce();
    expect(downloadCSVMock).toHaveBeenCalledOnce();
  });

  it("PDF download button for Balans triggers printToPDF on click", async () => {
    const printToPDFMock = vi.fn();
    const fetchBalanceSheetMock = vi.fn().mockResolvedValue({
      as_of: "2024-12-31",
      assets: { accounts: [], total_cents: 0 },
      liabilities: { accounts: [], total_cents: 0 },
      equity: { accounts: [], total_cents: 0 },
      retained_earnings_cents: 0,
      total_liabilities_and_equity_cents: 0,
      is_balanced: true,
    });

    vi.doMock("@/lib/export-utils", () => ({
      downloadCSV: vi.fn(),
      printToPDF: printToPDFMock,
    }));
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: fetchBalanceSheetMock,
      fetchIncomeStatement: vi.fn(),
      fetchCashFlow: vi.fn(),
      formatCents: vi.fn((c: number) => `€${c}`),
    }));
    vi.doMock("@/lib/financial-export", () => ({
      balanceSheetToCSV: vi.fn().mockReturnValue({ headers: ["H"], rows: [] }),
      balanceSheetToHTML: vi.fn().mockReturnValue("<p>html</p>"),
      incomeStatementToCSV: vi.fn().mockReturnValue({ headers: ["H"], rows: [] }),
      incomeStatementToHTML: vi.fn().mockReturnValue("<p>html</p>"),
      cashFlowToCSV: vi.fn().mockReturnValue({ headers: ["H"], rows: [] }),
      cashFlowToHTML: vi.fn().mockReturnValue("<p>html</p>"),
    }));

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    const pdfButtons = screen.getAllByText(/PDF Downloaden/i);
    await act(async () => {
      await userEvent.click(pdfButtons[0]);
    });

    expect(fetchBalanceSheetMock).toHaveBeenCalledOnce();
    expect(printToPDFMock).toHaveBeenCalledOnce();
  });

  it("shows loading state while fetching for CSV", async () => {
    let resolveBalanceSheet!: (v: unknown) => void;
    const pendingPromise = new Promise((res) => {
      resolveBalanceSheet = res;
    });

    vi.doMock("@/lib/export-utils", () => ({
      downloadCSV: vi.fn(),
      printToPDF: vi.fn(),
    }));
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockReturnValue(pendingPromise),
      fetchIncomeStatement: vi.fn(),
      fetchCashFlow: vi.fn(),
      formatCents: vi.fn((c: number) => `€${c}`),
    }));
    vi.doMock("@/lib/financial-export", () => ({
      balanceSheetToCSV: vi.fn().mockReturnValue({ headers: [], rows: [] }),
      balanceSheetToHTML: vi.fn().mockReturnValue(""),
      incomeStatementToCSV: vi.fn().mockReturnValue({ headers: [], rows: [] }),
      incomeStatementToHTML: vi.fn().mockReturnValue(""),
      cashFlowToCSV: vi.fn().mockReturnValue({ headers: [], rows: [] }),
      cashFlowToHTML: vi.fn().mockReturnValue(""),
    }));

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    const csvButtons = screen.getAllByText(/CSV Downloaden/i);
    act(() => {
      userEvent.click(csvButtons[0]);
    });

    // After clicking, the button should be disabled/loading
    await vi.waitFor(() => {
      expect(csvButtons[0]).toBeDisabled();
    });

    // Resolve to clean up
    resolveBalanceSheet({
      as_of: "2024-12-31",
      assets: { accounts: [], total_cents: 0 },
      liabilities: { accounts: [], total_cents: 0 },
      equity: { accounts: [], total_cents: 0 },
      retained_earnings_cents: 0,
      total_liabilities_and_equity_cents: 0,
      is_balanced: true,
    });
  });

  it("shows error message on API failure", async () => {
    vi.doMock("@/lib/export-utils", () => ({
      downloadCSV: vi.fn(),
      printToPDF: vi.fn(),
    }));
    vi.doMock("@/lib/financials", () => ({
      fetchBalanceSheet: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
      fetchIncomeStatement: vi.fn(),
      fetchCashFlow: vi.fn(),
      formatCents: vi.fn((c: number) => `€${c}`),
    }));
    vi.doMock("@/lib/financial-export", () => ({
      balanceSheetToCSV: vi.fn().mockReturnValue({ headers: [], rows: [] }),
      balanceSheetToHTML: vi.fn().mockReturnValue(""),
      incomeStatementToCSV: vi.fn().mockReturnValue({ headers: [], rows: [] }),
      incomeStatementToHTML: vi.fn().mockReturnValue(""),
      cashFlowToCSV: vi.fn().mockReturnValue({ headers: [], rows: [] }),
      cashFlowToHTML: vi.fn().mockReturnValue(""),
    }));

    const { default: ExportPage } = await import(
      "@/app/dashboard/financials/export/page"
    );

    await act(async () => {
      render(<ExportPage />);
    });

    const csvButtons = screen.getAllByText(/CSV Downloaden/i);
    await act(async () => {
      await userEvent.click(csvButtons[0]);
    });

    // Should show an error message in Dutch
    expect(screen.getByTestId("balans-error")).toBeInTheDocument();
  });
});
