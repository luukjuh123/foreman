import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/customers/cust-1"),
  useParams: vi.fn(() => ({ id: "cust-1" })),
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

const makeCustomer = (overrides: Partial<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  notes: string | null;
}> = {}) => ({
  id: overrides.id ?? "cust-1",
  name: overrides.name ?? "Bouwbedrijf Jansen",
  email: overrides.email !== undefined ? overrides.email : "jansen@bouw.nl",
  phone: overrides.phone !== undefined ? overrides.phone : "0612345678",
  kvk_number: overrides.kvk_number !== undefined ? overrides.kvk_number : "12345678",
  vat_number: overrides.vat_number !== undefined ? overrides.vat_number : "NL123456789B01",
  address_line1: overrides.address_line1 !== undefined ? overrides.address_line1 : "Dorpsstraat 1",
  address_line2: overrides.address_line2 !== undefined ? overrides.address_line2 : null,
  postal_code: overrides.postal_code !== undefined ? overrides.postal_code : "1234 AB",
  city: overrides.city !== undefined ? overrides.city : "Amsterdam",
  country_code: "NL",
  notes: overrides.notes !== undefined ? overrides.notes : null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeSummary = (overrides: Partial<{
  id: string;
  name: string;
  projects: unknown[];
  invoices: unknown[];
  outstanding_cents: number;
}> = {}) => ({
  id: overrides.id ?? "cust-1",
  name: overrides.name ?? "Bouwbedrijf Jansen",
  projects: overrides.projects ?? [],
  invoices: overrides.invoices ?? [],
  outstanding_cents: overrides.outstanding_cents ?? 0,
});

const makeProject = (overrides: Partial<{
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}> = {}) => ({
  id: overrides.id ?? "proj-1",
  name: overrides.name ?? "Verbouwing Kantoor",
  status: overrides.status ?? "active",
  start_date: overrides.start_date !== undefined ? overrides.start_date : "01-01-2024",
  end_date: overrides.end_date !== undefined ? overrides.end_date : "31-03-2024",
});

const makeInvoice = (overrides: Partial<{
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  total_cents: number;
}> = {}) => ({
  id: overrides.id ?? "inv-1",
  invoice_number: overrides.invoice_number ?? "2024-001",
  issue_date: overrides.issue_date ?? "01-01-2024",
  due_date: overrides.due_date ?? "31-01-2024",
  status: overrides.status ?? "sent",
  total_cents: overrides.total_cents ?? 121000,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests — loading state
// ---------------------------------------------------------------------------

describe("CustomerDetailPage — loading state", () => {
  it("shows loading indicator", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — error state
// ---------------------------------------------------------------------------

describe("CustomerDetailPage — error state", () => {
  it("shows error when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Klant niet gevonden."));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/klant niet gevonden/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — contact card
// ---------------------------------------------------------------------------

describe("CustomerDetailPage — contact card", () => {
  it("renders customer name as heading", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer({ name: "Schildersbedrijf Bakker" }))
      .mockResolvedValueOnce(makeSummary({ name: "Schildersbedrijf Bakker" }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /schildersbedrijf bakker/i })).toBeInTheDocument();
    });
  });

  it("renders email when present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer({ email: "bakker@schilders.nl" }))
      .mockResolvedValueOnce(makeSummary());

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("bakker@schilders.nl")).toBeInTheDocument();
    });
  });

  it("renders phone when present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer({ phone: "0201234567" }))
      .mockResolvedValueOnce(makeSummary());

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("0201234567")).toBeInTheDocument();
    });
  });

  it("renders KVK number when present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer({ kvk_number: "87654321" }))
      .mockResolvedValueOnce(makeSummary());

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("87654321")).toBeInTheDocument();
    });
  });

  it("renders outstanding amount formatted as Dutch euros", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({ outstanding_cents: 123456 }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      // € 1.234,56 in Dutch locale
      expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
    });
  });

  it("renders notes when present", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer({ notes: "Altijd eerst bellen" }))
      .mockResolvedValueOnce(makeSummary());

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Altijd eerst bellen")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — projects section
// ---------------------------------------------------------------------------

describe("CustomerDetailPage — projects section", () => {
  it("renders empty state when no projects", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({ projects: [] }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen projecten gekoppeld/i)).toBeInTheDocument();
    });
  });

  it("renders project names with links", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({
        projects: [makeProject({ id: "proj-1", name: "Verbouwing Kantoor" })],
      }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /verbouwing kantoor/i });
      expect(link).toHaveAttribute("href", "/dashboard/projects/proj-1");
    });
  });

  it("renders project status badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({
        projects: [makeProject({ status: "completed" })],
      }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Afgerond")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — invoices section
// ---------------------------------------------------------------------------

describe("CustomerDetailPage — invoices section", () => {
  it("renders empty state when no invoices", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({ invoices: [] }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen facturen gevonden/i)).toBeInTheDocument();
    });
  });

  it("renders invoice number with link", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({
        invoices: [makeInvoice({ id: "inv-1", invoice_number: "2024-001" })],
      }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "2024-001" });
      expect(link).toHaveAttribute("href", "/dashboard/invoices/inv-1");
    });
  });

  it("renders invoice status badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({
        invoices: [makeInvoice({ status: "paid" })],
      }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Betaald")).toBeInTheDocument();
    });
  });

  it("renders invoice total amount formatted as Dutch euros", async () => {
    const apiFetch = await getApiFetch();
    apiFetch
      .mockResolvedValueOnce(makeCustomer())
      .mockResolvedValueOnce(makeSummary({
        invoices: [makeInvoice({ total_cents: 60500 })],
      }));

    const { default: CustomerDetailPage } = await import(
      "@/app/dashboard/customers/[id]/page"
    );
    render(<CustomerDetailPage />);

    await waitFor(() => {
      // € 605,00
      expect(screen.getByText(/605,00/)).toBeInTheDocument();
    });
  });
});
