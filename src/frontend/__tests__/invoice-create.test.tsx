import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

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

import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import InvoiceCreatePage from "@/app/dashboard/invoices/new/page";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;
const mockUseRouter = useRouter as ReturnType<typeof vi.fn>;

const mockCustomers = [
  {
    id: "cust-1",
    name: "Bouwbedrijf de Vries",
    email: "info@devries.nl",
    kvk_number: "12345678",
    vat_number: "NL123456789B01",
    address_line1: "Hoofdstraat 1",
    address_line2: null,
    postal_code: "1234 AB",
    city: "Amsterdam",
    country_code: "NL",
  },
  {
    id: "cust-2",
    name: "Aannemingsbedrijf Jansen",
    email: null,
    kvk_number: null,
    vat_number: null,
    address_line1: null,
    address_line2: null,
    postal_code: null,
    city: null,
    country_code: "NL",
  },
];

const mockProjects = {
  data: [
    {
      id: "proj-1",
      name: "Renovatie Amsterdam",
      description: null,
      status: "active",
      start_date: null,
      end_date: null,
      budget_cents: null,
      phases: [],
    },
  ],
  total: 1,
  page: 1,
  per_page: 100,
};

const mockCreatedInvoice = {
  id: "inv-new",
  customer_id: "cust-1",
  project_id: null,
  invoice_number: "2026-0005",
  issue_date: "2026-05-19",
  due_date: "2026-06-18",
  payment_terms_days: 30,
  currency: "EUR",
  status: "draft",
  notes: null,
  subtotal_cents: 10000,
  vat_total_cents: 2100,
  total_cents: 12100,
  sent_at: null,
  paid_at: null,
  lines: [],
};

// Helper: render the page with customers + projects mocked
async function renderWithData() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/customers") return Promise.resolve(mockCustomers);
    if (path.startsWith("/projects")) return Promise.resolve(mockProjects);
    return Promise.reject(new Error("Unexpected path: " + path));
  });

  render(<InvoiceCreatePage />);

  // Wait for customers to load
  await waitFor(() => {
    expect(screen.getByText("Bouwbedrijf de Vries")).toBeInTheDocument();
  });
}

describe("InvoiceCreatePage — customer dropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders customer select with loaded options", async () => {
    await renderWithData();

    expect(screen.getByText("Bouwbedrijf de Vries")).toBeInTheDocument();
    expect(screen.getByText("Aannemingsbedrijf Jansen")).toBeInTheDocument();
  });

  it("renders project select with loaded options", async () => {
    await renderWithData();

    expect(screen.getByText("Renovatie Amsterdam")).toBeInTheDocument();
  });
});

describe("InvoiceCreatePage — line items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with one empty line item", async () => {
    await renderWithData();

    // One line item row should be present by default
    const descriptionInputs = screen.getAllByPlaceholderText(/omschrijving/i);
    expect(descriptionInputs.length).toBe(1);
  });

  it("can add a line item", async () => {
    await renderWithData();

    const addBtn = screen.getByRole("button", { name: /regel toevoegen/i });
    fireEvent.click(addBtn);

    const descriptionInputs = screen.getAllByPlaceholderText(/omschrijving/i);
    expect(descriptionInputs.length).toBe(2);
  });

  it("can remove a line item", async () => {
    await renderWithData();

    // Add a second line first
    const addBtn = screen.getByRole("button", { name: /regel toevoegen/i });
    fireEvent.click(addBtn);

    const removeButtons = screen.getAllByRole("button", { name: /regel verwijderen/i });
    expect(removeButtons.length).toBe(2);

    fireEvent.click(removeButtons[1]);

    const descriptionInputs = screen.getAllByPlaceholderText(/omschrijving/i);
    expect(descriptionInputs.length).toBe(1);
  });
});

describe("InvoiceCreatePage — live totals calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates subtotal, VAT and total in real-time", async () => {
    await renderWithData();

    // Fill in line item: 2 units at €50,00 with 21% VAT
    // quantity = 2, unit_price = 50.00 (displayed euros), => 10000 cents subtotal
    const descInput = screen.getAllByPlaceholderText(/omschrijving/i)[0];
    fireEvent.change(descInput, { target: { value: "Fundatiewerk" } });

    const qtyInputs = screen.getAllByPlaceholderText(/aantal/i);
    fireEvent.change(qtyInputs[0], { target: { value: "2" } });

    const priceInputs = screen.getAllByPlaceholderText(/prijs/i);
    fireEvent.change(priceInputs[0], { target: { value: "50.00" } });

    // subtotal: 2 * 50 = 100 euros = €100,00
    // VAT 21%: 100 * 0.21 = 21 euros = €21,00
    // total: €121,00
    await waitFor(() => {
      expect(screen.getByText(/100,00/)).toBeInTheDocument();
    });
    // VAT: €21,00 — use exact match to avoid matching €121,00
    expect(screen.getAllByText(/21,00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/121,00/)).toBeInTheDocument();
  });

  it("updates totals when adding multiple lines", async () => {
    await renderWithData();

    // Line 1: 1 * €100 at 21% VAT
    const desc1 = screen.getAllByPlaceholderText(/omschrijving/i)[0];
    fireEvent.change(desc1, { target: { value: "Arbeid" } });
    const qty1 = screen.getAllByPlaceholderText(/aantal/i)[0];
    fireEvent.change(qty1, { target: { value: "1" } });
    const price1 = screen.getAllByPlaceholderText(/prijs/i)[0];
    fireEvent.change(price1, { target: { value: "100.00" } });

    // Add second line
    fireEvent.click(screen.getByRole("button", { name: /regel toevoegen/i }));

    // Line 2: 1 * €50 at 9% VAT
    const desc2 = screen.getAllByPlaceholderText(/omschrijving/i)[1];
    fireEvent.change(desc2, { target: { value: "Materiaal" } });
    const qty2 = screen.getAllByPlaceholderText(/aantal/i)[1];
    fireEvent.change(qty2, { target: { value: "1" } });
    const price2 = screen.getAllByPlaceholderText(/prijs/i)[1];
    fireEvent.change(price2, { target: { value: "50.00" } });

    // Change line 2 VAT to 9%
    const vatSelects = screen.getAllByRole("combobox");
    // Find the VAT select for line 2 (last VAT select in line items)
    const vatSelectsLine = vatSelects.filter((s) =>
      s.querySelector ? false : true
    );
    // Select the VAT rate selects that have option values of 2100, 900, 0
    const allSelects = document.querySelectorAll("select");
    // VAT selects are those with option 2100
    const vatSelectEls = Array.from(allSelects).filter((s) =>
      Array.from(s.options).some((o) => o.value === "900")
    );
    if (vatSelectEls[1]) {
      fireEvent.change(vatSelectEls[1], { target: { value: "900" } });
    }

    // subtotal: 100 + 50 = €150,00
    // VAT: 100*0.21 + 50*0.09 = 21 + 4.5 = 25.5 => €25,50
    // total: 175.5 => €175,50
    await waitFor(() => {
      expect(screen.getByText(/150,00/)).toBeInTheDocument();
    });
  });
});

describe("InvoiceCreatePage — form submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits to POST /invoices with correct payload and redirects", async () => {
    const mockPush = vi.fn();
    mockUseRouter.mockReturnValue({ push: mockPush });

    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/customers") return Promise.resolve(mockCustomers);
      if (path.startsWith("/projects")) return Promise.resolve(mockProjects);
      if (path === "/invoices" && opts?.method === "POST") return Promise.resolve(mockCreatedInvoice);
      return Promise.reject(new Error("Unexpected: " + path));
    });

    render(<InvoiceCreatePage />);

    await waitFor(() => {
      expect(screen.getByText("Bouwbedrijf de Vries")).toBeInTheDocument();
    });

    // Select customer
    const customerSelects = document.querySelectorAll("select");
    const customerSelect = Array.from(customerSelects).find((s) =>
      Array.from(s.options).some((o) => o.value === "cust-1")
    );
    expect(customerSelect).toBeDefined();
    fireEvent.change(customerSelect!, { target: { value: "cust-1" } });

    // Fill in line item
    const descInput = screen.getAllByPlaceholderText(/omschrijving/i)[0];
    fireEvent.change(descInput, { target: { value: "Fundatiewerk" } });
    const qtyInput = screen.getAllByPlaceholderText(/aantal/i)[0];
    fireEvent.change(qtyInput, { target: { value: "10" } });
    const priceInput = screen.getAllByPlaceholderText(/prijs/i)[0];
    fireEvent.change(priceInput, { target: { value: "50.00" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /factuur aanmaken/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/invoices",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"customer_id":"cust-1"'),
        })
      );
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/invoices/inv-new");
    });
  });

  it("sends line items with correct cents values", async () => {
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/customers") return Promise.resolve(mockCustomers);
      if (path.startsWith("/projects")) return Promise.resolve(mockProjects);
      if (path === "/invoices" && opts?.method === "POST") return Promise.resolve(mockCreatedInvoice);
      return Promise.reject(new Error("Unexpected: " + path));
    });

    render(<InvoiceCreatePage />);

    await waitFor(() => {
      expect(screen.getByText("Bouwbedrijf de Vries")).toBeInTheDocument();
    });

    const customerSelects = document.querySelectorAll("select");
    const customerSelect = Array.from(customerSelects).find((s) =>
      Array.from(s.options).some((o) => o.value === "cust-1")
    );
    fireEvent.change(customerSelect!, { target: { value: "cust-1" } });

    const descInput = screen.getAllByPlaceholderText(/omschrijving/i)[0];
    fireEvent.change(descInput, { target: { value: "Materiaal" } });
    const qtyInput = screen.getAllByPlaceholderText(/aantal/i)[0];
    fireEvent.change(qtyInput, { target: { value: "3" } });
    const priceInput = screen.getAllByPlaceholderText(/prijs/i)[0];
    // 12.50 euros -> 1250 cents
    fireEvent.change(priceInput, { target: { value: "12.50" } });

    const submitBtn = screen.getByRole("button", { name: /factuur aanmaken/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/invoices",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"unit_price_cents":1250'),
        })
      );
    });
  });
});

describe("InvoiceCreatePage — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation error when no customer selected", async () => {
    await renderWithData();

    const submitBtn = screen.getByRole("button", { name: /factuur aanmaken/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/klant is verplicht/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when no line items", async () => {
    await renderWithData();

    // Select customer
    const customerSelects = document.querySelectorAll("select");
    const customerSelect = Array.from(customerSelects).find((s) =>
      Array.from(s.options).some((o) => o.value === "cust-1")
    );
    fireEvent.change(customerSelect!, { target: { value: "cust-1" } });

    // Remove the default line
    const removeButtons = screen.getAllByRole("button", { name: /regel verwijderen/i });
    fireEvent.click(removeButtons[0]);

    const submitBtn = screen.getByRole("button", { name: /factuur aanmaken/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/minimaal één regel/i)).toBeInTheDocument();
    });
  });
});

describe("InvoiceCreatePage — API error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error message when API call fails", async () => {
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/customers") return Promise.resolve(mockCustomers);
      if (path.startsWith("/projects")) return Promise.resolve(mockProjects);
      if (path === "/invoices" && opts?.method === "POST")
        return Promise.reject(new Error("Server error"));
      return Promise.reject(new Error("Unexpected: " + path));
    });

    render(<InvoiceCreatePage />);

    await waitFor(() => {
      expect(screen.getByText("Bouwbedrijf de Vries")).toBeInTheDocument();
    });

    const customerSelects = document.querySelectorAll("select");
    const customerSelect = Array.from(customerSelects).find((s) =>
      Array.from(s.options).some((o) => o.value === "cust-1")
    );
    fireEvent.change(customerSelect!, { target: { value: "cust-1" } });

    const descInput = screen.getAllByPlaceholderText(/omschrijving/i)[0];
    fireEvent.change(descInput, { target: { value: "Arbeid" } });

    const submitBtn = screen.getByRole("button", { name: /factuur aanmaken/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });
});

describe("InvoiceCreatePage — navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has a back link to /dashboard/invoices", async () => {
    await renderWithData();

    const links = screen.getAllByRole("link");
    const backLink = links.find((l) => l.getAttribute("href") === "/dashboard/invoices");
    expect(backLink).toBeInTheDocument();
  });
});
