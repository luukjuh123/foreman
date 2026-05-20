import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/invoices"),
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

const makeInvoice = (overrides: Partial<{
  id: string;
  invoice_number: string;
  status: "draft" | "sent" | "paid" | "overdue";
  issue_date: string;
  due_date: string;
  total_cents: number;
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
  notes: null,
  subtotal_cents: 50000,
  vat_total_cents: 10500,
  total_cents: overrides.total_cents ?? 60500,
  sent_at: null,
  paid_at: null,
  lines: [],
});

const makeListResponse = (
  invoices: ReturnType<typeof makeInvoice>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: invoices,
  total: overrides.total ?? invoices.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InvoiceListPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("InvoiceListPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

describe("InvoiceListPage — empty state", () => {
  it("shows empty state message when no invoices", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen facturen/i)).toBeInTheDocument();
    });
  });
});

describe("InvoiceListPage — renders invoice list", () => {
  beforeEach(async () => {
    vi.resetModules();
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeInvoice({ id: "inv-1", invoice_number: "2024-001", status: "draft" }),
        makeInvoice({ id: "inv-2", invoice_number: "2024-002", status: "sent" }),
      ])
    );
  });

  it("renders invoice numbers", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeInvoice({ id: "inv-1", invoice_number: "2024-001" }),
        makeInvoice({ id: "inv-2", invoice_number: "2024-002" }),
      ])
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByText("2024-001")).toBeInTheDocument();
      expect(screen.getByText("2024-002")).toBeInTheDocument();
    });
  });

  it("renders Dutch status labels", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeInvoice({ status: "draft" }),
        makeInvoice({ id: "inv-2", status: "sent" }),
        makeInvoice({ id: "inv-3", status: "paid" }),
        makeInvoice({ id: "inv-4", status: "overdue" }),
      ])
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
      expect(screen.getByText("Verzonden")).toBeInTheDocument();
      expect(screen.getByText("Betaald")).toBeInTheDocument();
      expect(screen.getByText("Verlopen")).toBeInTheDocument();
    });
  });

  it("renders formatted total in Dutch money format", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeInvoice({ total_cents: 60500 })])
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      // €605,00 in Dutch locale
      expect(screen.getByText(/605,00/)).toBeInTheDocument();
    });
  });

  it("renders issue date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeInvoice({ issue_date: "2024-03-22" })])
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByText("22-03-2024")).toBeInTheDocument();
    });
  });

  it("renders due date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeInvoice({ due_date: "2024-04-22" })])
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByText("22-04-2024")).toBeInTheDocument();
    });
  });

  it("each invoice row links to its detail page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeInvoice({ id: "inv-42", invoice_number: "2024-042" })])
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /2024-042/ });
      expect(link).toHaveAttribute("href", "/dashboard/invoices/inv-42");
    });
  });
});

describe("InvoiceListPage — header", () => {
  it("renders Facturen page title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /facturen/i })).toBeInTheDocument();
    });
  });

  it("renders Nieuwe factuur button linking to /dashboard/invoices/new", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /nieuwe factuur/i });
      expect(link).toHaveAttribute("href", "/dashboard/invoices/new");
    });
  });
});

describe("InvoiceListPage — status filter buttons", () => {
  it("renders all filter buttons: Alle, Concept, Verzonden, Betaald, Verlopen", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^alle$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^concept$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^verzonden$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^betaald$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^verlopen$/i })).toBeInTheDocument();
    });
  });

  it("fetches with status=draft when Concept filter is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));
    apiFetch.mockClear();

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => screen.getByRole("button", { name: /^concept$/i }));
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^concept$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("status=draft")
      );
    });
  });

  it("fetches with status=sent when Verzonden filter is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));
    apiFetch.mockClear();

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => screen.getByRole("button", { name: /^verzonden$/i }));
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^verzonden$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("status=sent")
      );
    });
  });

  it("fetches without status filter when Alle is clicked after a status filter", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => screen.getByRole("button", { name: /^concept$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^concept$/i }));
    await waitFor(() => screen.getByRole("button", { name: /^alle$/i }));
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^alle$/i }));

    await waitFor(() => {
      const calls = apiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).not.toMatch(/status=/);
    });
  });
});

describe("InvoiceListPage — pagination", () => {
  it("shows next page button when there are more pages", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeInvoice({ id: `inv-${i}`, invoice_number: `2024-${String(i).padStart(3, "0")}` })
        ),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("shows previous page button when not on first page", async () => {
    const apiFetch = await getApiFetch();
    // Simulate page 2
    apiFetch.mockResolvedValue(
      makeListResponse(
        [makeInvoice()],
        { total: 25, page: 2, per_page: 20 }
      )
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    // Click next to get to page 2
    // (The component starts on page 1 and we need to click Volgende)
    // Instead, we test by having 2 pages and navigating
    // Since the mock returns page=2 data, we check via clicking next
    await waitFor(() => {
      // On first render (page 1) with total=25 and per_page=20 there is a next button
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /volgende/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /vorige/i })).toBeInTheDocument();
    });
  });

  it("does not show next page button when on last page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeInvoice()], { total: 1, page: 1, per_page: 20 })
    );

    const { default: InvoiceListPage } = await import(
      "@/app/dashboard/invoices/page"
    );
    render(<InvoiceListPage />);

    await waitFor(() => {
      // total=1, per_page=20: only one page, no next button
      expect(screen.queryByRole("button", { name: /volgende/i })).toBeNull();
    });
  });
});
