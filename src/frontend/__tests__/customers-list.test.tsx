import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/customers"),
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
  city: string | null;
  notes: string | null;
}> = {}) => ({
  id: overrides.id ?? "cust-1",
  name: overrides.name ?? "Bouwbedrijf Jansen",
  email: overrides.email !== undefined ? overrides.email : "jansen@bouw.nl",
  phone: overrides.phone !== undefined ? overrides.phone : "0612345678",
  kvk_number: overrides.kvk_number !== undefined ? overrides.kvk_number : "12345678",
  vat_number: overrides.vat_number !== undefined ? overrides.vat_number : null,
  address_line1: overrides.address_line1 !== undefined ? overrides.address_line1 : "Dorpsstraat 1",
  address_line2: null,
  postal_code: "1234 AB",
  city: overrides.city !== undefined ? overrides.city : "Amsterdam",
  country_code: "NL",
  notes: overrides.notes !== undefined ? overrides.notes : null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeListResponse = (
  customers: ReturnType<typeof makeCustomer>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: customers,
  total: overrides.total ?? customers.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests — loading state
// ---------------------------------------------------------------------------

describe("KlantenPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — error state
// ---------------------------------------------------------------------------

describe("KlantenPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — empty state
// ---------------------------------------------------------------------------

describe("KlantenPage — empty state", () => {
  it("shows empty state when no customers", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText(/nog geen klanten aangemaakt/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — renders list
// ---------------------------------------------------------------------------

describe("KlantenPage — renders list", () => {
  it("renders customer names", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeCustomer({ id: "cust-1", name: "Bouwbedrijf Jansen" }),
        makeCustomer({ id: "cust-2", name: "Schildersbedrijf De Vries" }),
      ])
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText("Bouwbedrijf Jansen")).toBeInTheDocument();
      expect(screen.getByText("Schildersbedrijf De Vries")).toBeInTheDocument();
    });
  });

  it("renders customer city", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeCustomer({ city: "Rotterdam" })])
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText("Rotterdam")).toBeInTheDocument();
    });
  });

  it("renders customer email", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeCustomer({ email: "info@jansen.nl" })])
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText("info@jansen.nl")).toBeInTheDocument();
    });
  });

  it("renders dash when email is null", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeCustomer({ email: null })])
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  it("customer name links to detail page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeCustomer({ id: "cust-abc", name: "Test Klant" })])
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "Test Klant" });
      expect(link).toHaveAttribute("href", "/dashboard/customers/cust-abc");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — header and add button
// ---------------------------------------------------------------------------

describe("KlantenPage — header", () => {
  it("renders Klanten page title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /klanten/i })).toBeInTheDocument();
    });
  });

  it("renders Klant toevoegen button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /klant toevoegen/i })).toBeInTheDocument();
    });
  });

  it("opens add dialog when Klant toevoegen is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => screen.getByRole("button", { name: /klant toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /klant toevoegen/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/naam/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — search
// ---------------------------------------------------------------------------

describe("KlantenPage — search", () => {
  it("renders search input", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /zoeken/i })).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — pagination
// ---------------------------------------------------------------------------

describe("KlantenPage — pagination", () => {
  it("shows next page button when there are more pages", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeCustomer({ id: `cust-${i}`, name: `Klant ${i}` })
        ),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("does not show next page button on last page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeCustomer()], { total: 1, page: 1, per_page: 20 })
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /volgende/i })).toBeNull();
    });
  });

  it("shows page info when multiple pages exist", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) => makeCustomer({ id: `c-${i}`, name: `Klant ${i}` })),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => {
      expect(screen.getByText(/pagina 1 van 2/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — dialog form
// ---------------------------------------------------------------------------

describe("KlantenPage — dialog form", () => {
  it("dialog shows naam and stad fields", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => screen.getByRole("button", { name: /klant toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /klant toevoegen/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/naam/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/stad/i)).toBeInTheDocument();
    });
  });

  it("dialog shows telefoon and kvk fields", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: KlantenPage } = await import("@/app/dashboard/customers/page");
    render(<KlantenPage />);

    await waitFor(() => screen.getByRole("button", { name: /klant toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /klant toevoegen/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/telefoon/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/kvk/i)).toBeInTheDocument();
    });
  });
});
