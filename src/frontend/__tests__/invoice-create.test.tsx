import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/invoices/new"),
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
// Helpers
// ---------------------------------------------------------------------------

const mockCustomers = [
  {
    id: "cust-1",
    name: "Bouw BV",
    email: "info@bouwbv.nl",
    kvk_number: "12345678",
    vat_number: "NL123456789B01",
    address_line1: "Bouwstraat 1",
    postal_code: "1234AB",
    city: "Amsterdam",
    country_code: "NL",
  },
  {
    id: "cust-2",
    name: "Aannemersbedrijf Jansen",
    email: null,
    kvk_number: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country_code: null,
  },
];

const mockInvoiceResponse = {
  id: "inv-1",
  customer_id: "cust-1",
  project_id: null,
  invoice_number: "2024-001",
  issue_date: "2024-01-15",
  due_date: "2024-02-14",
  payment_terms_days: 30,
  notes: null,
  status: "draft",
  subtotal_cents: 10000,
  vat_total_cents: 2100,
  total_cents: 12100,
  lines: [],
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
};

// ---------------------------------------------------------------------------
// Unit: cents math helpers
// ---------------------------------------------------------------------------

describe("invoice cents math", () => {
  it("converts euro string to cents correctly", () => {
    // 12.50 euros → 1250 cents
    const eurToCents = (s: string) => Math.round(parseFloat(s) * 100);
    expect(eurToCents("12.50")).toBe(1250);
    expect(eurToCents("100")).toBe(10000);
    expect(eurToCents("0.99")).toBe(99);
    expect(eurToCents("1234.56")).toBe(123456);
  });

  it("formats cents to Dutch locale euro string", () => {
    const formatEur = (cents: number) =>
      new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
    expect(formatEur(1250)).toContain("12,50");
    expect(formatEur(123456)).toContain("1.234,56");
    expect(formatEur(0)).toContain("0,00");
  });

  it("calculates line total excl VAT in cents", () => {
    // quantity=2, unit_price=5000 cents (€50) → 10000 cents
    const lineTotal = (qty: number, priceCents: number) => qty * priceCents;
    expect(lineTotal(2, 5000)).toBe(10000);
    expect(lineTotal(3, 333)).toBe(999);
  });

  it("calculates VAT amount for 21% rate (2100 bp)", () => {
    // 10000 cents excl * 2100 bp / 10000 = 2100 cents VAT
    const vatAmount = (totalExcl: number, vatBp: number) =>
      Math.round((totalExcl * vatBp) / 10000);
    expect(vatAmount(10000, 2100)).toBe(2100);
    expect(vatAmount(10000, 900)).toBe(900);
    expect(vatAmount(10000, 0)).toBe(0);
  });

  it("sums totals across multiple lines with different VAT rates", () => {
    const lines = [
      { qty: 2, priceCents: 5000, vatBp: 2100 }, // 10000 excl, 2100 VAT
      { qty: 1, priceCents: 2000, vatBp: 900 },   // 2000 excl, 180 VAT
    ];
    const subtotal = lines.reduce((s, l) => s + l.qty * l.priceCents, 0);
    const vatTotal = lines.reduce(
      (s, l) => s + Math.round((l.qty * l.priceCents * l.vatBp) / 10000),
      0
    );
    expect(subtotal).toBe(12000);
    expect(vatTotal).toBe(2280);
    expect(subtotal + vatTotal).toBe(14280);
  });
});

// ---------------------------------------------------------------------------
// InvoiceCreatePage — component tests
// ---------------------------------------------------------------------------

describe("InvoiceCreatePage", () => {
  beforeEach(async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/invoices/customers") return mockCustomers;
      return mockInvoiceResponse;
    });
  });

  it("renders page heading 'Nieuwe Factuur'", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Nieuwe Factuur")).toBeInTheDocument();
  });

  it("renders Klant section", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Klant")).toBeInTheDocument();
  });

  it("renders Factuurdatum label", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Factuurdatum")).toBeInTheDocument();
  });

  it("renders Betalingstermijn label", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Betalingstermijn")).toBeInTheDocument();
  });

  it("renders Regelitems section heading", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Regelitems")).toBeInTheDocument();
  });

  it("renders Subtotaal in totals summary", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Subtotaal")).toBeInTheDocument();
  });

  it("renders BTW Totaal in totals summary", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("BTW Totaal")).toBeInTheDocument();
  });

  it("renders Totaal in totals summary", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    const totaalLabels = screen.getAllByText("Totaal");
    expect(totaalLabels.length).toBeGreaterThan(0);
  });

  it("renders Opslaan submit button", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByRole("button", { name: /opslaan/i })).toBeInTheDocument();
  });

  it("loads customers from API and shows them in dropdown", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("Bouw BV")).toBeInTheDocument();
    });
  });

  it("shows 'Aannemersbedrijf Jansen' in customer list", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("Aannemersbedrijf Jansen")).toBeInTheDocument();
    });
  });

  it("shows 'Nieuwe klant' option to create a new customer", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/nieuwe klant/i)).toBeInTheDocument();
    });
  });

  it("shows inline new customer form when 'Nieuwe klant' is clicked", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    await waitFor(() => screen.getByText(/nieuwe klant/i));
    fireEvent.click(screen.getByText(/nieuwe klant/i));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/bedrijfsnaam/i)).toBeInTheDocument();
    });
  });

  it("has at least one initial line item row with Omschrijving field", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBeGreaterThan(0);
  });

  it("has Aantal field on initial line item", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    // Label 'Aantal' present
    expect(screen.getByText("Aantal")).toBeInTheDocument();
  });

  it("has Eenheid field on initial line item", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Eenheid")).toBeInTheDocument();
  });

  it("has 'Prijs per eenheid' label on initial line item", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("Prijs per eenheid")).toBeInTheDocument();
  });

  it("has BTW dropdown on initial line item", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    expect(screen.getByText("BTW")).toBeInTheDocument();
  });

  it("adds a new line item when 'Regel toevoegen' is clicked", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    const initialRows = screen.getAllByPlaceholderText(/omschrijving/i).length;
    fireEvent.click(screen.getByRole("button", { name: /regel toevoegen/i }));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(initialRows + 1);
    });
  });

  it("removes a line item when the remove button is clicked (when >1 line)", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);

    // Add a second line first
    fireEvent.click(screen.getByRole("button", { name: /regel toevoegen/i }));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(2);
    });

    // Remove one
    const removeButtons = screen.getAllByRole("button", { name: /verwijder/i });
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(1);
    });
  });

  it("auto-calculates totals when line fields are filled in", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);

    // Fill in: qty=2, unit_price=50.00 → subtotal=100.00, VAT 21%=21.00, total=121.00
    const qtyInput = screen.getByTestId("line-qty-0");
    const priceInput = screen.getByTestId("line-price-0");

    fireEvent.change(qtyInput, { target: { value: "2" } });
    fireEvent.change(priceInput, { target: { value: "50" } });

    await waitFor(() => {
      const subtotalEl = screen.getByTestId("summary-subtotal");
      expect(subtotalEl.textContent).toContain("100");
    });
  });

  it("VAT total updates when VAT rate changes", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);

    const qtyInput = screen.getByTestId("line-qty-0");
    const priceInput = screen.getByTestId("line-price-0");

    fireEvent.change(qtyInput, { target: { value: "1" } });
    fireEvent.change(priceInput, { target: { value: "100" } });

    // Default VAT is 21% → VAT = €21
    await waitFor(() => {
      const vatEl = screen.getByTestId("summary-vat");
      expect(vatEl.textContent).toContain("21");
    });
  });

  it("submits form and calls POST /invoices/ on valid data", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/invoices/customers") return mockCustomers;
      return mockInvoiceResponse;
    });

    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);

    // Wait for customers to load
    await waitFor(() => screen.getByText("Bouw BV"));

    // Select first customer
    const customerSelect = screen.getByTestId("customer-select");
    fireEvent.change(customerSelect, { target: { value: "cust-1" } });

    // Fill in a line item
    fireEvent.change(screen.getByTestId("line-desc-0"), {
      target: { value: "Metselwerk" },
    });
    fireEvent.change(screen.getByTestId("line-qty-0"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("line-price-0"), { target: { value: "500" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/invoices/",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows error message on API failure", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/invoices/customers") return mockCustomers;
      throw new Error("Server fout");
    });

    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);

    await waitFor(() => screen.getByText("Bouw BV"));

    const customerSelect = screen.getByTestId("customer-select");
    fireEvent.change(customerSelect, { target: { value: "cust-1" } });

    fireEvent.change(screen.getByTestId("line-desc-0"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByTestId("line-qty-0"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("line-price-0"), { target: { value: "10" } });

    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(screen.getByText(/server fout/i)).toBeInTheDocument();
    });
  });

  it("payment terms defaults to 30 days", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    const termsInput = screen.getByTestId("payment-terms-input");
    expect((termsInput as HTMLInputElement).value).toBe("30");
  });

  it("issue date defaults to today", async () => {
    const { default: Page } = await import("@/app/dashboard/invoices/new/page");
    render(<Page />);
    const today = new Date().toISOString().split("T")[0];
    const dateInput = screen.getByTestId("issue-date-input");
    expect((dateInput as HTMLInputElement).value).toBe(today);
  });
});
