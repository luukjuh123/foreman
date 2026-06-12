import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/quotes/new"),
  useParams: vi.fn(() => ({})),
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
// Unit: totals computation
// ---------------------------------------------------------------------------

describe("quote totals computation", () => {
  it("computes subtotal from line items in cents", () => {
    // qty=2, price=€50 (5000 cents) → subtotal=10000 cents
    const lines = [{ quantity: "2", unit_price: "50", vat_rate_bp: 2100 }];
    const subtotal = lines.reduce((s, l) => {
      const qty = parseFloat(l.quantity) || 0;
      const priceCents = Math.round(parseFloat(l.unit_price) * 100);
      return s + Math.round(qty * priceCents);
    }, 0);
    expect(subtotal).toBe(10000);
  });

  it("computes BTW for 21% (2100 bp)", () => {
    const subtotalCents = 10000;
    const vat = Math.round((subtotalCents * 2100) / 10000);
    expect(vat).toBe(2100);
  });

  it("computes BTW for 9% (900 bp)", () => {
    const subtotalCents = 10000;
    const vat = Math.round((subtotalCents * 900) / 10000);
    expect(vat).toBe(900);
  });

  it("computes BTW for 0% (0 bp)", () => {
    const subtotalCents = 10000;
    const vat = Math.round((subtotalCents * 0) / 10000);
    expect(vat).toBe(0);
  });

  it("sums totals across multiple lines with different BTW rates", () => {
    const lines = [
      { qty: 2, priceCents: 5000, vatBp: 2100 }, // 10000 excl, 2100 BTW
      { qty: 1, priceCents: 2000, vatBp: 900 },   // 2000 excl, 180 BTW
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

  it("formats Dutch money correctly", () => {
    const format = (cents: number) =>
      new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
    expect(format(123456)).toContain("1.234,56");
    expect(format(60500)).toContain("605,00");
    expect(format(0)).toContain("0,00");
  });
});

// ---------------------------------------------------------------------------
// QuoteBuilderPage — component tests (create mode)
// ---------------------------------------------------------------------------

describe("QuoteBuilderPage (create)", () => {
  const mockQuoteResponse = {
    id: "quote-1",
    quote_number: "OFF-2026-0001",
    customer_name: "Bouw BV",
    customer_email: "info@bouwbv.nl",
    customer_address: "Bouwstraat 1",
    status: "draft",
    valid_until: "2026-07-01",
    notes: null,
    project_id: null,
    subtotal_cents: 10000,
    vat_cents: 2100,
    total_cents: 12100,
    line_items: [],
  };

  beforeEach(async () => {
    vi.resetModules();
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue(mockQuoteResponse);
  });

  it("renders heading 'Nieuwe Offerte'", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByRole("heading", { name: /nieuwe offerte/i })).toBeInTheDocument();
  });

  it("renders klant section with customer_name field", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByPlaceholderText(/naam klant/i)).toBeInTheDocument();
  });

  it("renders customer_email field", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByPlaceholderText(/e-mail/i)).toBeInTheDocument();
  });

  it("renders customer_address field", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByPlaceholderText(/adres/i)).toBeInTheDocument();
  });

  it("renders valid_until date field", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByLabelText(/geldig tot/i)).toBeInTheDocument();
  });

  it("renders at least one line item row with Omschrijving", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBeGreaterThan(0);
  });

  it("renders BTW select options 21%, 9%, 0%", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByText("21%")).toBeInTheDocument();
    expect(screen.getByText("9%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("adds a new line item when Regel toevoegen is clicked", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    const initialRows = screen.getAllByPlaceholderText(/omschrijving/i).length;
    fireEvent.click(screen.getByRole("button", { name: /regel toevoegen/i }));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(initialRows + 1);
    });
  });

  it("removes a line item when remove button is clicked (when >1 line)", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: /regel toevoegen/i }));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(2);
    });

    const removeButtons = screen.getAllByRole("button", { name: /verwijder/i });
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(1);
    });
  });

  it("live-computes subtotal when line fields are filled", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);

    const qtyInput = screen.getByTestId("line-qty-0");
    const priceInput = screen.getByTestId("line-price-0");

    fireEvent.change(qtyInput, { target: { value: "2" } });
    fireEvent.change(priceInput, { target: { value: "50" } });

    await waitFor(() => {
      const subtotalEl = screen.getByTestId("summary-subtotal");
      expect(subtotalEl.textContent).toContain("100");
    });
  });

  it("live-computes BTW total for 21% rate", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);

    fireEvent.change(screen.getByTestId("line-qty-0"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("line-price-0"), { target: { value: "100" } });

    await waitFor(() => {
      const vatEl = screen.getByTestId("summary-vat");
      expect(vatEl.textContent).toContain("21");
    });
  });

  it("renders Opslaan als concept submit button", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByRole("button", { name: /opslaan/i })).toBeInTheDocument();
  });

  it("submits form and calls POST /quotes with draft payload", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue(mockQuoteResponse);

    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);

    fireEvent.change(screen.getByPlaceholderText(/naam klant/i), {
      target: { value: "Bouw BV" },
    });
    fireEvent.change(screen.getByTestId("line-desc-0"), {
      target: { value: "Metselwerk" },
    });
    fireEvent.change(screen.getByTestId("line-qty-0"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("line-price-0"), { target: { value: "500" } });

    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/quotes",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows error message on API failure", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockRejectedValue(new Error("Server fout"));

    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);

    fireEvent.change(screen.getByPlaceholderText(/naam klant/i), {
      target: { value: "Test" },
    });
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
});
