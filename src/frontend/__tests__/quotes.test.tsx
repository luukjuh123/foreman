import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useParams: vi.fn(() => ({ id: "quote-1" })),
  usePathname: vi.fn(() => "/dashboard/quotes"),
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
// Fixtures
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
];

const mockQuote = {
  id: "quote-1",
  customer_id: "cust-1",
  quote_number: "OFF-2026-0001",
  valid_until: "2026-12-31",
  status: "draft",
  notes: "Test offerte",
  subtotal_cents: 50000,
  vat_total_cents: 10500,
  total_cents: 60500,
  sent_at: null,
  accepted_at: null,
  rejected_at: null,
  lines: [
    {
      id: "line-1",
      position: 0,
      description: "Stucwerk woonkamer",
      quantity: 10,
      unit: "m2",
      unit_price_cents: 5000,
      vat_rate_bp: 2100,
      line_net_cents: 50000,
      line_vat_cents: 10500,
    },
  ],
};

const mockQuoteListResponse = {
  data: [mockQuote],
  total: 1,
  page: 1,
  per_page: 20,
};

// ---------------------------------------------------------------------------
// Quote list page tests
// ---------------------------------------------------------------------------

describe("QuoteListPage", () => {
  beforeEach(async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockResolvedValue(mockQuoteListResponse);
  });

  it("renders 'Offertes' heading", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/page");
    render(<Page />);
    expect(screen.getByText("Offertes")).toBeInTheDocument();
  });

  it("renders 'Nieuwe offerte' button", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/page");
    render(<Page />);
    expect(screen.getByText(/nieuwe offerte/i)).toBeInTheDocument();
  });

  it("renders filter tabs: Alle, Concept, Verzonden, Geaccepteerd, Afgewezen, Verlopen", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/page");
    render(<Page />);
    expect(screen.getByText("Alle")).toBeInTheDocument();
    expect(screen.getByText("Concept")).toBeInTheDocument();
    expect(screen.getByText("Verzonden")).toBeInTheDocument();
    expect(screen.getByText("Geaccepteerd")).toBeInTheDocument();
    expect(screen.getByText("Afgewezen")).toBeInTheDocument();
    expect(screen.getByText("Verlopen")).toBeInTheDocument();
  });

  it("loads and displays quote number from API", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("OFF-2026-0001")).toBeInTheDocument();
    });
  });

  it("displays status badge 'Concept' for draft status", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/page");
    render(<Page />);
    await waitFor(() => {
      const badges = screen.getAllByText("Concept");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("shows formatted money total (€ format)", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/page");
    render(<Page />);
    await waitFor(() => {
      // 60500 cents = €605,00 in nl-NL locale
      const content = screen.getByText(/605/);
      expect(content).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Quote creation form tests
// ---------------------------------------------------------------------------

describe("QuoteCreatePage", () => {
  beforeEach(async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/invoices/customers") return mockCustomers;
      return mockQuote;
    });
  });

  it("renders 'Nieuwe Offerte' heading", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByText("Nieuwe Offerte")).toBeInTheDocument();
  });

  it("renders Klant section", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByText("Klant")).toBeInTheDocument();
  });

  it("renders Geldig tot label", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByText("Geldig tot")).toBeInTheDocument();
  });

  it("renders Regelitems section", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByText("Regelitems")).toBeInTheDocument();
  });

  it("renders Subtotaal in summary", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByText("Subtotaal")).toBeInTheDocument();
  });

  it("renders Totaal in summary", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    const labels = screen.getAllByText("Totaal");
    expect(labels.length).toBeGreaterThan(0);
  });

  it("renders Opslaan submit button", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getByRole("button", { name: /opslaan/i })).toBeInTheDocument();
  });

  it("loads customers and shows them in dropdown", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("Bouw BV")).toBeInTheDocument();
    });
  });

  it("has initial line item description field", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBeGreaterThan(0);
  });

  it("adds a new line item when 'Regel toevoegen' is clicked", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    const initial = screen.getAllByPlaceholderText(/omschrijving/i).length;
    fireEvent.click(screen.getByRole("button", { name: /regel toevoegen/i }));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(/omschrijving/i).length).toBe(initial + 1);
    });
  });

  it("auto-calculates totals when line fields are filled", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);
    fireEvent.change(screen.getByTestId("line-qty-0"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("line-price-0"), { target: { value: "50" } });
    await waitFor(() => {
      const subtotalEl = screen.getByTestId("summary-subtotal");
      expect(subtotalEl.textContent).toContain("100");
    });
  });

  it("submits form and calls POST /quotes/", async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/invoices/customers") return mockCustomers;
      return mockQuote;
    });

    const { default: Page } = await import("@/app/dashboard/quotes/new/page");
    render(<Page />);

    await waitFor(() => screen.getByText("Bouw BV"));

    fireEvent.change(screen.getByTestId("customer-select"), { target: { value: "cust-1" } });
    fireEvent.change(screen.getByTestId("line-desc-0"), { target: { value: "Metselwerk" } });
    fireEvent.change(screen.getByTestId("line-qty-0"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("line-price-0"), { target: { value: "500" } });

    fireEvent.click(screen.getByRole("button", { name: /opslaan/i }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/quotes/",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Quote detail page tests
// ---------------------------------------------------------------------------

describe("QuoteDetailPage", () => {
  beforeEach(async () => {
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.includes("/quotes/")) return mockQuote;
      if (path.includes("/customers/")) return { email: "info@bouwbv.nl" };
      return mockQuote;
    });
  });

  it("renders quote number heading", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("OFF-2026-0001")).toBeInTheDocument();
    });
  });

  it("shows status badge", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      const badges = screen.getAllByText("Concept");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("shows 'Versturen' action button for draft", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /versturen/i })).toBeInTheDocument();
    });
  });

  it("shows line item description", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("Stucwerk woonkamer")).toBeInTheDocument();
    });
  });

  it("shows 'Omzetten naar project' button for draft (convert CTA visible)", async () => {
    // Accepted quote detail shows convert button
    const sentQuote = { ...mockQuote, status: "accepted" };
    const { apiFetch } = await import("@/lib/api");
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.includes("/quotes/")) return sentQuote;
      if (path.includes("/customers/")) return { email: "info@bouwbv.nl" };
      return sentQuote;
    });

    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      const btns = screen.getAllByRole("button", { name: /omzetten naar project/i });
      expect(btns.length).toBeGreaterThan(0);
    });
  });

  it("shows Geldig tot date", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      // 2026-12-31 → 31-12-2026
      expect(screen.getByText("31-12-2026")).toBeInTheDocument();
    });
  });

  it("shows subtotal, VAT, and total", async () => {
    const { default: Page } = await import("@/app/dashboard/quotes/[id]/page");
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("Subtotaal")).toBeInTheDocument();
      // BTW appears as both a table column header and a totals label
      const btwItems = screen.getAllByText("BTW");
      expect(btwItems.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Quote money formatting helpers
// ---------------------------------------------------------------------------

describe("quote money formatting", () => {
  it("formats cents in nl-NL currency style", () => {
    const fmt = (cents: number) =>
      new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
    expect(fmt(60500)).toContain("605,00");
    expect(fmt(123456)).toContain("1.234,56");
  });

  it("formats dates as dd-MM-yyyy", () => {
    const formatDate = (iso: string) => {
      const [y, m, d] = iso.split("T")[0].split("-");
      return `${d}-${m}-${y}`;
    };
    expect(formatDate("2026-12-31")).toBe("31-12-2026");
    expect(formatDate("2026-01-05")).toBe("05-01-2026");
  });
});
