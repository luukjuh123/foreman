import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/quotes"),
  useParams: vi.fn(() => ({})),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/quotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quotes")>();
  return {
    ...actual,
    listQuotes: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { QuoteResponse, QuoteStatus } from "@/lib/quotes";

function makeQuote(overrides: Partial<{
  id: string;
  quote_number: string;
  status: QuoteStatus;
  valid_until: string | null;
  total_cents: number;
  subtotal_cents: number;
  vat_total_cents: number;
}> = {}): QuoteResponse {
  return {
    id: overrides.id ?? "q-1",
    customer_id: "cust-1",
    project_id: null,
    quote_number: overrides.quote_number ?? "OFF-2026-0001",
    status: overrides.status ?? "draft",
    valid_until: overrides.valid_until ?? "2026-12-31",
    notes: null,
    subtotal_cents: overrides.subtotal_cents ?? 100000,
    vat_total_cents: overrides.vat_total_cents ?? 21000,
    total_cents: overrides.total_cents ?? 121000,
    sent_at: null,
    accepted_at: null,
    created_at: "2026-06-12T10:00:00Z",
    lines: [],
  };
}

function makeListResponse(
  quotes: QuoteResponse[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) {
  return {
    data: quotes,
    total: overrides.total ?? quotes.length,
    page: overrides.page ?? 1,
    per_page: overrides.per_page ?? 20,
  };
}

async function getListQuotes() {
  const { listQuotes } = await import("@/lib/quotes");
  return vi.mocked(listQuotes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QuoteListPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("QuoteListPage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockRejectedValue(new Error("Netwerk fout"));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

describe("QuoteListPage — empty state", () => {
  it("shows empty state when no quotes", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText(/geen offertes/i)).toBeInTheDocument();
    });
  });
});

describe("QuoteListPage — header", () => {
  it("renders Offertes heading and Nieuwe offerte link", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /offertes/i })).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /nieuwe offerte/i });
      expect(link).toHaveAttribute("href", "/dashboard/quotes/new");
    });
  });
});

describe("QuoteListPage — renders quote list", () => {
  it("renders quote numbers", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(
      makeListResponse([
        makeQuote({ id: "q-1", quote_number: "OFF-2026-0001" }),
        makeQuote({ id: "q-2", quote_number: "OFF-2026-0002" }),
      ])
    );

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("OFF-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("OFF-2026-0002")).toBeInTheDocument();
    });
  });

  it("renders Dutch status badges", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(
      makeListResponse([
        makeQuote({ id: "q-1", status: "draft" }),
        makeQuote({ id: "q-2", status: "sent" }),
        makeQuote({ id: "q-3", status: "accepted" }),
        makeQuote({ id: "q-4", status: "rejected" }),
        makeQuote({ id: "q-5", status: "expired" }),
      ])
    );

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
      expect(screen.getByText("Verzonden")).toBeInTheDocument();
      expect(screen.getByText("Geaccepteerd")).toBeInTheDocument();
      expect(screen.getByText("Afgewezen")).toBeInTheDocument();
      expect(screen.getByText("Verlopen")).toBeInTheDocument();
    });
  });

  it("renders formatted total in Dutch money format", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([makeQuote({ total_cents: 121000 })]));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByText(/1\.210,00/)).toBeInTheDocument();
    });
  });

  it("links each row to detail page", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(
      makeListResponse([makeQuote({ id: "q-42", quote_number: "OFF-2026-0042" })])
    );

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /OFF-2026-0042/ });
      expect(link).toHaveAttribute("href", "/dashboard/quotes/q-42");
    });
  });
});

describe("QuoteListPage — status filter buttons", () => {
  it("renders all filter buttons in Dutch", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
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

  it("calls listQuotes with status=draft when Concept is clicked", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => screen.getByRole("button", { name: /^concept$/i }));
    listQuotes.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^concept$/i }));

    await waitFor(() => {
      expect(listQuotes).toHaveBeenCalledWith(1, 20, "draft");
    });
  });

  it("calls listQuotes without status filter when Alle is clicked", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([]));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => screen.getByRole("button", { name: /^concept$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^concept$/i }));
    await waitFor(() => screen.getByRole("button", { name: /^alle$/i }));
    listQuotes.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^alle$/i }));

    await waitFor(() => {
      expect(listQuotes).toHaveBeenCalledWith(1, 20, undefined);
    });
  });
});

describe("QuoteListPage — pagination", () => {
  it("shows Volgende button when there are more pages", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(
      makeListResponse(
        Array.from({ length: 20 }, (_, i) => makeQuote({ id: `q-${i}`, quote_number: `OFF-2026-${String(i).padStart(4, "0")}` })),
        { total: 40, page: 1, per_page: 20 }
      )
    );

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
    });
  });

  it("does not show Volgende button on last page", async () => {
    const listQuotes = await getListQuotes();
    listQuotes.mockResolvedValue(makeListResponse([makeQuote()], { total: 1, page: 1, per_page: 20 }));

    const { default: QuoteListPage } = await import("@/app/dashboard/quotes/page");
    render(<QuoteListPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /volgende/i })).toBeNull();
    });
  });
});
