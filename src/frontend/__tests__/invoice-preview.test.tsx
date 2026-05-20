import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useParams: vi.fn(() => ({ id: "inv-1" })),
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

const makeLine = (overrides: Partial<{
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_bp: number;
  line_total_cents: number;
  vat_amount_cents: number;
}> = {}) => ({
  id: overrides.id ?? "line-1",
  invoice_id: "inv-1",
  description: overrides.description ?? "Arbeid",
  quantity: overrides.quantity ?? 10,
  unit: overrides.unit ?? "uur",
  unit_price_cents: overrides.unit_price_cents ?? 5000,
  vat_rate_bp: overrides.vat_rate_bp ?? 2100,
  line_total_cents: overrides.line_total_cents ?? 50000,
  vat_amount_cents: overrides.vat_amount_cents ?? 10500,
});

const makeInvoice = (overrides: Partial<{
  id: string;
  invoice_number: string;
  status: "draft" | "sent" | "paid" | "overdue";
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  notes: string | null;
  lines: ReturnType<typeof makeLine>[];
}> = {}) => ({
  id: overrides.id ?? "inv-1",
  customer_id: "cust-1",
  project_id: null,
  invoice_number: overrides.invoice_number ?? "2024-001",
  issue_date: overrides.issue_date ?? "2024-01-15",
  due_date: overrides.due_date ?? "2024-02-15",
  payment_terms_days: 30,
  currency: "EUR",
  status: overrides.status ?? "draft",
  notes: overrides.notes ?? null,
  subtotal_cents: overrides.subtotal_cents ?? 50000,
  vat_total_cents: overrides.vat_total_cents ?? 10500,
  total_cents: overrides.total_cents ?? 60500,
  sent_at: null,
  paid_at: null,
  lines: overrides.lines ?? [makeLine()],
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InvoicePreviewPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("InvoicePreviewPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Factuur niet gevonden"));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/factuur niet gevonden/i)).toBeInTheDocument();
    });
  });
});

describe("InvoicePreviewPage — renders invoice details", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders the invoice number", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ invoice_number: "2024-042" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      // The heading renders "Factuur 2024-042" — match by regex
      expect(screen.getByText(/2024-042/)).toBeInTheDocument();
    });
  });

  it("renders the issue date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ issue_date: "2024-03-22" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("22-03-2024")).toBeInTheDocument();
    });
  });

  it("renders the due date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ due_date: "2024-04-30" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("30-04-2024")).toBeInTheDocument();
    });
  });

  it("renders the draft status badge as Concept", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ status: "draft" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
    });
  });

  it("renders the sent status badge as Verzonden", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ status: "sent" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Verzonden")).toBeInTheDocument();
    });
  });

  it("renders the paid status badge as Betaald", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ status: "paid" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Betaald")).toBeInTheDocument();
    });
  });

  it("renders the overdue status badge as Verlopen", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ status: "overdue" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Verlopen")).toBeInTheDocument();
    });
  });

  it("renders line item description", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeInvoice({ lines: [makeLine({ description: "Metselwerk fundament" })] })
    );

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Metselwerk fundament")).toBeInTheDocument();
    });
  });

  it("renders line total in Dutch money format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeInvoice({
        lines: [makeLine({ line_total_cents: 50000 })],
        subtotal_cents: 99999, // distinct value so €500,00 only appears in line column
        vat_total_cents: 88888,
        total_cents: 77777,
      })
    );

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      // €500,00 in Dutch locale — appears in line total cell
      expect(screen.getByText(/€\s*500,00/)).toBeInTheDocument();
    });
  });

  it("renders total_cents as Dutch money", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ total_cents: 121000 }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      // €1.210,00 in Dutch locale
      expect(screen.getByText(/1\.210,00/)).toBeInTheDocument();
    });
  });
});

describe("InvoicePreviewPage — PDF button", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders PDF Bekijken button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice());

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pdf bekijken/i })).toBeInTheDocument();
    });
  });
});

describe("InvoicePreviewPage — UBL download button", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders UBL Downloaden button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice());

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ubl downloaden/i })).toBeInTheDocument();
    });
  });
});

describe("InvoicePreviewPage — send button", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("open", vi.fn());
  });

  it("renders Versturen button for draft invoices", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ status: "draft" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /versturen/i })).toBeInTheDocument();
    });
  });

  it("does not render Versturen button for non-draft invoices", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice({ status: "sent" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /versturen/i })).toBeNull();
    });
  });

  it("calls transition API when Versturen is clicked", async () => {
    const apiFetch = await getApiFetch();
    const sentInvoice = makeInvoice({ status: "sent" });
    apiFetch
      .mockResolvedValueOnce(makeInvoice({ status: "draft" }))
      .mockResolvedValueOnce(sentInvoice);

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /versturen/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /versturen/i }));

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

  it("updates status badge to Verzonden after successful transition", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeInvoice({ status: "draft" }))
      .mockResolvedValueOnce(makeInvoice({ status: "sent" }));

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /versturen/i }));

    await waitFor(() => {
      expect(screen.getByText("Verzonden")).toBeInTheDocument();
    });
  });
});

describe("InvoicePreviewPage — back navigation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders a link back to the invoices list", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeInvoice());

    const { default: InvoicePreviewPage } = await import(
      "@/app/dashboard/invoices/[id]/page"
    );
    render(<InvoicePreviewPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /facturen/i });
      expect(link).toHaveAttribute("href", "/dashboard/invoices");
    });
  });
});
