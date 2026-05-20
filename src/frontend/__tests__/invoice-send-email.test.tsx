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

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

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

const mockLine = () => ({
  id: "line-1",
  description: "Fundatiewerk",
  quantity: 10,
  unit: "m2",
  unit_price_cents: 5000,
  vat_rate_bp: 2100,
  line_total_cents: 50000,
  line_net_cents: 50000,
  line_vat_cents: 10500,
  position: 1,
});

const mockInvoice = (overrides: Partial<{
  id: string;
  status: "draft" | "sent" | "paid" | "overdue";
  customer_id: string;
}> = {}) => ({
  id: overrides.id ?? "inv-1",
  customer_id: overrides.customer_id ?? "cust-1",
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
  lines: [mockLine()],
});

const mockCustomer = (overrides: Partial<{ email: string | null }> = {}) => ({
  id: "cust-1",
  name: "Bouw BV",
  email: overrides.email !== undefined ? overrides.email : "bouw@example.com",
  kvk_number: null,
  vat_number: null,
  address_line1: "Bouwstraat 1",
  address_line2: null,
  postal_code: "1234 AB",
  city: "Amsterdam",
  country_code: "NL",
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// InvoiceSendDialog — unit tests for the dialog component
// ---------------------------------------------------------------------------

describe("InvoiceSendDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue("test-access-token");
  });

  it("renders nothing when closed", async () => {
    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");
    const onSent = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={false}
        onOpenChange={onOpenChange}
        onSent={onSent}
        customerEmail={null}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with invoice summary when open", async () => {
    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");
    const onSent = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={onOpenChange}
        onSent={onSent}
        customerEmail="bouw@example.com"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // invoice number (appears in description and summary)
    expect(screen.getAllByText(/2024-001/).length).toBeGreaterThan(0);
    // total amount
    expect(screen.getAllByText(/605,00/).length).toBeGreaterThan(0);
    // due date formatted
    expect(screen.getAllByText(/15-02-2024/).length).toBeGreaterThan(0);
  });

  it("pre-fills email field with customer email", async () => {
    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={vi.fn()}
        onSent={vi.fn()}
        customerEmail="bouw@example.com"
      />
    );

    await waitFor(() => {
      const input = screen.getByRole("textbox");
      expect((input as HTMLInputElement).value).toBe("bouw@example.com");
    });
  });

  it("shows empty email field when customer has no email", async () => {
    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={vi.fn()}
        onSent={vi.fn()}
        customerEmail={null}
      />
    );

    await waitFor(() => {
      const input = screen.getByRole("textbox");
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  it("calls transition API when Versturen button clicked in dialog", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "sent" }));

    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");
    const onSent = vi.fn();

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={vi.fn()}
        onSent={onSent}
        customerEmail="bouw@example.com"
      />
    );

    await waitFor(() => screen.getByRole("dialog"));

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

  it("calls onSent callback with updated invoice on success", async () => {
    const apiFetch = await getApiFetch();
    const sentInvoice = mockInvoice({ status: "sent" });
    apiFetch.mockResolvedValueOnce(sentInvoice);

    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");
    const onSent = vi.fn();

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={vi.fn()}
        onSent={onSent}
        customerEmail="bouw@example.com"
      />
    );

    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByRole("button", { name: /versturen/i }));

    await waitFor(() => {
      expect(onSent).toHaveBeenCalledWith(sentInvoice);
    });
  });

  it("shows error message in dialog on API failure", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValueOnce(new Error("Versturen mislukt"));

    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={vi.fn()}
        onSent={vi.fn()}
        customerEmail="bouw@example.com"
      />
    );

    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByRole("button", { name: /versturen/i }));

    await waitFor(() => {
      expect(screen.getByText(/versturen mislukt/i)).toBeInTheDocument();
    });
  });

  it("does not close dialog on API failure", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValueOnce(new Error("Netwerkfout"));

    const { InvoiceSendDialog } = await import("@/components/invoice-send-dialog");
    const onOpenChange = vi.fn();

    render(
      <InvoiceSendDialog
        invoice={mockInvoice()}
        open={true}
        onOpenChange={onOpenChange}
        onSent={vi.fn()}
        customerEmail="bouw@example.com"
      />
    );

    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByRole("button", { name: /versturen/i }));

    await waitFor(() => {
      expect(screen.getByText(/netwerkfout/i)).toBeInTheDocument();
    });

    // onOpenChange should NOT have been called with false to close
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// InvoiceDetailPage — send dialog integration tests
// ---------------------------------------------------------------------------

describe("InvoiceDetailPage — send email button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue("test-access-token");

    const mockBlob = new Blob(["pdf"], { type: "application/pdf" });
    mockFetch.mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(mockBlob) });
  });

  it("shows Verstuur per e-mail button for draft invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "draft" }));
    apiFetch.mockResolvedValueOnce(mockCustomer()); // customer fetch

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /verstuur per e-mail/i })).toBeInTheDocument();
    });
  });

  it("hides Verstuur per e-mail button for sent invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "sent" }));
    apiFetch.mockResolvedValueOnce(mockCustomer());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByText(/verzonden/i));

    expect(screen.queryByRole("button", { name: /verstuur per e-mail/i })).toBeNull();
  });

  it("hides Verstuur per e-mail button for paid invoice", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "paid" }));
    apiFetch.mockResolvedValueOnce(mockCustomer());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getAllByText(/betaald/i));

    expect(screen.queryByRole("button", { name: /verstuur per e-mail/i })).toBeNull();
  });

  it("opens the send dialog when Verstuur per e-mail clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "draft" }));
    apiFetch.mockResolvedValueOnce(mockCustomer());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /verstuur per e-mail/i }));

    fireEvent.click(screen.getByRole("button", { name: /verstuur per e-mail/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("dialog shows invoice number and amount after opening", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "draft" }));
    apiFetch.mockResolvedValueOnce(mockCustomer());

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /verstuur per e-mail/i }));

    fireEvent.click(screen.getByRole("button", { name: /verstuur per e-mail/i }));

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(screen.getAllByText(/2024-001/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/605,00/).length).toBeGreaterThan(0);
    });
  });

  it("transitions invoice status and closes dialog on confirm", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "draft" }));
    apiFetch.mockResolvedValueOnce(mockCustomer());
    apiFetch.mockResolvedValueOnce(mockInvoice({ status: "sent" })); // transition result

    const { default: InvoiceDetailPage } = await import("@/app/dashboard/invoices/[id]/page");
    render(<InvoiceDetailPage params={Promise.resolve({ id: "inv-1" })} />);

    await waitFor(() => screen.getByRole("button", { name: /verstuur per e-mail/i }));

    fireEvent.click(screen.getByRole("button", { name: /verstuur per e-mail/i }));

    await waitFor(() => screen.getByRole("dialog"));

    // Click confirm inside dialog
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

    // Dialog should be closed after success
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
