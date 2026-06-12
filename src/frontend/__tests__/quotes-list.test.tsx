import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
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

const makeQuote = (overrides: Partial<{
  id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  valid_until: string;
  total_cents: number;
  subtotal_cents: number;
  vat_cents: number;
  notes: string | null;
  project_id: string | null;
  line_items: unknown[];
}> = {}) => ({
  id: overrides.id ?? "quote-1",
  quote_number: overrides.quote_number ?? "OFF-2026-0001",
  customer_name: overrides.customer_name ?? "Bouw BV",
  customer_email: overrides.customer_email ?? "info@bouwbv.nl",
  customer_address: overrides.customer_address ?? "Bouwstraat 1, Amsterdam",
  status: overrides.status ?? "draft",
  valid_until: overrides.valid_until ?? "2026-07-01",
  notes: overrides.notes ?? null,
  project_id: overrides.project_id ?? null,
  subtotal_cents: overrides.subtotal_cents ?? 50000,
  vat_cents: overrides.vat_cents ?? 10500,
  total_cents: overrides.total_cents ?? 60500,
  line_items: overrides.line_items ?? [],
});

const makeListResponse = (
  quotes: ReturnType<typeof makeQuote>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: quotes,
  total: overrides.total ?? quotes.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: loading / error / empty
// ---------------------------------------------------------------------------

describe("QuoteListPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("QuoteListPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

describe("QuoteListPage — empty state", () => {
  it("shows empty state message when no quotes", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen offertes/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: list rendering
// ---------------------------------------------------------------------------

describe("QuoteListPage — renders quote list", () => {
  it("renders quote numbers", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeQuote({ id: "q-1", quote_number: "OFF-2026-0001" }),
        makeQuote({ id: "q-2", quote_number: "OFF-2026-0002" }),
      ])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("OFF-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("OFF-2026-0002")).toBeInTheDocument();
    });
  });

  it("renders customer name", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ customer_name: "Aannemersbedrijf Jansen" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Aannemersbedrijf Jansen")).toBeInTheDocument();
    });
  });

  it("renders total in Dutch money format €1.234,56", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ total_cents: 123456 })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
    });
  });

  it("renders valid_until date formatted as dd-MM-yyyy", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ valid_until: "2026-07-15" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("15-07-2026")).toBeInTheDocument();
    });
  });

  it("each quote row links to its detail page", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ id: "quote-42", quote_number: "OFF-2026-0042" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /OFF-2026-0042/ });
      expect(link).toHaveAttribute("href", "/dashboard/quotes/quote-42");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Dutch status labels
// ---------------------------------------------------------------------------

describe("QuoteListPage — Dutch status labels", () => {
  it("renders Concept for draft status", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ status: "draft" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
    });
  });

  it("renders Verzonden for sent status", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ status: "sent" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Verzonden")).toBeInTheDocument();
    });
  });

  it("renders Geaccepteerd for accepted status", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ status: "accepted" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Geaccepteerd")).toBeInTheDocument();
    });
  });

  it("renders Afgewezen for rejected status", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ status: "rejected" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Afgewezen")).toBeInTheDocument();
    });
  });

  it("renders Verlopen for expired status", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeQuote({ status: "expired" })])
    );

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Verlopen")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: header
// ---------------------------------------------------------------------------

describe("QuoteListPage — header", () => {
  it("renders Offertes page title", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /offertes/i })).toBeInTheDocument();
    });
  });

  it("renders Nieuwe offerte button linking to /dashboard/quotes/new", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /nieuwe offerte/i });
      expect(link).toHaveAttribute("href", "/dashboard/quotes/new");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: status filter tabs
// ---------------------------------------------------------------------------

describe("QuoteListPage — status filter tabs", () => {
  it("renders all filter buttons", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^alle$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^concept$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^verzonden$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^geaccepteerd$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^afgewezen$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^verlopen$/i })).toBeInTheDocument();
    });
  });

  it("fetches with status=draft when Concept filter is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

    await waitFor(() => screen.getByRole("button", { name: /^concept$/i }));
    apiFetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^concept$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("status=draft")
      );
    });
  });

  it("fetches without status filter when Alle is clicked after a status filter", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import(
      "@/app/dashboard/quotes/page"
    );
    render(<QuoteListPage />);

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
