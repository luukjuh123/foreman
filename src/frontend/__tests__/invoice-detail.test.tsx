import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/invoices"),
  useParams: vi.fn(() => ({ id: "inv-1" })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock apiFetch
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// Mock global fetch for PDF/UBL binary downloads
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => "test-access-token"),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockLine = (overrides: Partial<{
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
  line_total_cents: number;
}> = {}) => ({
  id: overrides.id ?? "line-1",
  description: overrides.description ?? "Fundatiewerk",
  quantity: overrides.quantity ?? 10,
  unit: overrides.unit ?? "m2",
  unit_price_cents: overrides.unit_price_cents ?? 5000,
  vat_rate_bp: overrides.vat_rate_bp ?? 2100,
  line_total_cents: overrides.line_total_cents ?? 50000,
});

const mockInvoice = (overrides: Partial<{
  id: string;
  status: "draft" | "sent" | "paid" | "overdue";
  lines: ReturnType<typeof mockLine>[];
}> = {}) => ({
  id: overrides.id ?? "inv-1",
  customer_id: "cust-1",
  project_id: "proj-1",
  invoice_number: "2024-001",
  issue_date: "2024-01-15",
  due_date: "2024-02-15",
  payment_terms_days: 30,
  currency: "EUR",
  status: overrides.status ?? "draft",
  notes: "Betaling binnen 30 dagen",
  subtotal_cents: 50000,
  vat_total_cents: 10500,
  total_cents: 60500,
  sent_at: null,
  paid_at: null,
  lines: overrides.lines ?? [mockLine()],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Unit: formatMoney helper
// ---------------------------------------------------------------------------

describe("formatMoney", () => {
  it("formats cents to Dutch euro notation", async () => {
    const { formatMoney } = await import("@/lib/invoice-helpers");
    expect(formatMoney(60500)).toBe("€\u00a0605,00");
  });

  it("formats large amounts with thousands separator", async () => {
    const { formatMoney } = await import("@/lib/invoice-helpers");
    expect(formatMoney(500000_00)).toBe("€\u00a0500.000,00");
  });

  it("formats zero correctly", async () => {
    const { formatMoney } = await import("@/lib/invoice-helpers");
    expect(formatMoney(0)).toBe("€\u00a00,00");
  });
});

// ---------------------------------------------------------------------------
// Unit: formatInvoiceDate helper
// ---------------------------------------------------------------------------

describe("formatInvoiceDate", () => {
  it("formats ISO date to dd-MM-yyyy", async () => {
    const { formatInvoiceDate } = await import("@/lib/invoice-helpers");
    expect(formatInvoiceDate("2024-01-15")).toBe("15-01-2024");
  });

  it("returns empty string for null", async () => {
    const { formatInvoiceDate } = await import("@/lib/invoice-helpers");
    expect(formatInvoiceDate(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — loading and error states
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage loading", () => {
  it("shows loading text while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("shows error message on fetch failure", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Factuur niet gevonden"));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "bad-id" })} />);

    await waitFor(() => {
      expect(screen.getByText(/factuur niet gevonden/i)).toBeInTheDocument();
    });
  });

  it("renders back link to invoice list on error", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Fout"));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "bad-id" })} />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const backLink = links.find((l) => l.getAttribute("href") === "/dashboard/invoices");
      expect(backLink).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — renders invoice data
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage renders invoice data", () => {
  beforeEach(async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue("test-access-token");
    // Re-apply mock after clearAllMocks
    const apiFetch2 = await getApiFetch();
    apiFetch2.mockResolvedValue(mockInvoice());
  });

  it("renders invoice number", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/2024-001/)).toBeInTheDocument();
    });
  });

  it("renders status badge for draft invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/concept/i)).toBeInTheDocument();
    });
  });

  it("renders issue date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/15-01-2024/)).toBeInTheDocument();
    });
  });

  it("renders due date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/15-02-2024/)).toBeInTheDocument();
    });
  });

  it("renders line item description", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Fundatiewerk")).toBeInTheDocument();
    });
  });

  it("renders line item quantity and unit", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("m2")).toBeInTheDocument();
    });
  });

  it("renders subtotal, VAT total, and grand total", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      // subtotal_cents=50000 => €500,00 (may appear multiple times — in line total and subtotal)
      expect(screen.getAllByText(/500,00/).length).toBeGreaterThan(0);
      // vat_total_cents=10500 => €105,00
      expect(screen.getAllByText(/105,00/).length).toBeGreaterThan(0);
      // total_cents=60500 => €605,00
      expect(screen.getAllByText(/605,00/).length).toBeGreaterThan(0);
    });
  });

  it("renders back link to /dashboard/invoices", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const backLink = links.find((l) => l.getAttribute("href") === "/dashboard/invoices");
      expect(backLink).toBeInTheDocument();
    });
  });

  it("renders notes when present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Betaling binnen 30 dagen")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — PDF iframe
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage PDF preview", () => {
  it("renders an iframe or object for PDF preview", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    const { container } = render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      const iframe = container.querySelector("iframe");
      const obj = container.querySelector("object");
      expect(iframe ?? obj).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — action buttons
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage action buttons — draft invoice", () => {
  it("shows Verstuur per e-mail button for draft invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /verstuur per e-mail/i })).toBeInTheDocument();
    });
  });

  it("does not show Markeer als betaald for draft invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByText(/concept/i));

    expect(screen.queryByRole("button", { name: /markeer als betaald/i })).toBeNull();
  });

  it("shows Download PDF button for draft invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    });
  });

  it("shows Download UBL button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /download ubl/i })).toBeInTheDocument();
    });
  });
});

describe("InvoiceDetailPage action buttons — sent invoice", () => {
  it("shows Markeer als betaald button for sent invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "sent" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /markeer als betaald/i })).toBeInTheDocument();
    });
  });

  it("does not show Versturen button for sent invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "sent" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByText(/verzonden/i));

    expect(screen.queryByRole("button", { name: /versturen/i })).toBeNull();
  });
});

describe("InvoiceDetailPage action buttons — paid invoice", () => {
  it("does not show Versturen or Markeer als betaald for paid invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "paid" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByText(/betaald/i));

    expect(screen.queryByRole("button", { name: /versturen/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /markeer als betaald/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — status transitions
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage status transitions", () => {
  it("calls transition API and updates status via send dialog", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "draft" }));
    // customer fetch (may silently fail — mock it returning a minimal object)
    apiFetch.mockResolvedValueOnce({ email: "bouw@example.com" });
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "sent" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    // Click trigger button to open dialog
    await waitFor(() => screen.getByRole("button", { name: /verstuur per e-mail/i }));
    fireEvent.click(screen.getByRole("button", { name: /verstuur per e-mail/i }));

    // Click confirm inside dialog
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^versturen$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/invoices/inv-1/transition",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "sent" }),
        })
      );
    });
  });

  it("calls transition API and updates status on Markeer als betaald click", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "sent" }));
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "paid" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /markeer als betaald/i }));

    fireEvent.click(screen.getByRole("button", { name: /markeer als betaald/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/invoices/inv-1/transition",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "paid" }),
        })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — PDF/UBL download
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage download buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue("test-access-token");

    const mockBlob = new Blob(["pdf content"], { type: "application/pdf" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls fetch with PDF url on Download PDF click", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /download pdf/i }));

    // Set up anchor mock AFTER render to avoid interfering with React's DOM setup
    const originalCreateElement = document.createElement.bind(document);
    const mockClick = vi.fn();
    const mockAnchor = { href: "", download: "", click: mockClick, style: { display: "" } } as unknown as HTMLAnchorElement;
    const createSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return mockAnchor;
      return originalCreateElement(tag);
    });
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockAnchor);
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => mockAnchor);

    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/invoices/inv-1/pdf"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-access-token" }),
        })
      );
    });

    createSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("calls fetch with UBL url on Download UBL click", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status: "draft" }));

    const mockXmlBlob = new Blob(["xml content"], { type: "application/xml" });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(mockXmlBlob),
    });

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /download ubl/i }));

    // Set up anchor mock AFTER render to avoid interfering with React's DOM setup
    const originalCreateElement = document.createElement.bind(document);
    const mockClick = vi.fn();
    const mockAnchor = { href: "", download: "", click: mockClick, style: { display: "" } } as unknown as HTMLAnchorElement;
    const createSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") return mockAnchor;
      return originalCreateElement(tag);
    });
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockAnchor);
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => mockAnchor);

    fireEvent.click(screen.getByRole("button", { name: /download ubl/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/invoices/inv-1/ubl"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-access-token" }),
        })
      );
    });

    createSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Status badge labels
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage status badges", () => {
  it.each([
    ["draft", /concept/i],
    ["sent", /verzonden/i],
    ["paid", /betaald/i],
    ["overdue", /verlopen/i],
  ] as const)("shows correct Dutch label for status %s", async (status, label) => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(mockInvoice({ status }));

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });
});
