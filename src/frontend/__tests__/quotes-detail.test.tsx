import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/quotes/quote-1"),
  useParams: vi.fn(() => ({ id: "quote-1" })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// Mock window.confirm to always return true in tests
Object.defineProperty(window, "confirm", {
  value: vi.fn(() => true),
  writable: true,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeDraftQuote = () => ({
  id: "quote-1",
  quote_number: "OFF-2026-0001",
  customer_name: "Bouw BV",
  customer_email: "info@bouwbv.nl",
  customer_address: "Bouwstraat 1, Amsterdam",
  status: "draft",
  valid_until: "2026-07-01",
  notes: "Test opmerkingen",
  project_id: null,
  subtotal_cents: 50000,
  vat_cents: 10500,
  total_cents: 60500,
  line_items: [
    {
      description: "Metselwerk",
      quantity: 10,
      unit: "m2",
      unit_price_cents: 5000,
      vat_rate_bp: 2100,
    },
  ],
});

const makeSentQuote = () => ({
  ...makeDraftQuote(),
  status: "sent",
});

const makeAcceptedQuote = (projectId = "proj-99") => ({
  ...makeDraftQuote(),
  status: "accepted",
  project_id: projectId,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: loading / error states
// ---------------------------------------------------------------------------

describe("QuoteDetailPage — loading state", () => {
  it("shows loading indicator", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe("QuoteDetailPage — error state", () => {
  it("shows error when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Niet gevonden"));

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/niet gevonden/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: detail rendering
// ---------------------------------------------------------------------------

describe("QuoteDetailPage — detail rendering", () => {
  beforeEach(async () => {
    vi.resetModules();
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());
  });

  it("renders quote number in heading", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /OFF-2026-0001/ })).toBeInTheDocument();
    });
  });

  it("renders customer name", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bouw BV")).toBeInTheDocument();
    });
  });

  it("renders line item description", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Metselwerk")).toBeInTheDocument();
    });
  });

  it("renders subtotal, BTW and total amounts", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      // subtotal_cents=50000 → €500,00; total_cents=60500 → €605,00
      expect(screen.getAllByText(/500,00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/605,00/).length).toBeGreaterThan(0);
    });
  });

  it("renders link back to quotes list", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /offertes/i });
      expect(link).toHaveAttribute("href", "/dashboard/quotes");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: status-dependent action buttons
// ---------------------------------------------------------------------------

describe("QuoteDetailPage — draft status actions", () => {
  it("shows Versturen button for draft quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /versturen/i })).toBeInTheDocument();
    });
  });

  it("shows Bewerken button for draft quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /bewerken/i })).toBeInTheDocument();
    });
  });

  it("shows Verwijderen button for draft quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /verwijderen/i })).toBeInTheDocument();
    });
  });

  it("calls POST /quotes/{id}/send when Versturen is clicked", async () => {
    const apiFetch = await getApiFetch();
    const sentQuote = { ...makeDraftQuote(), status: "sent" };
    apiFetch
      .mockResolvedValueOnce(makeDraftQuote())
      .mockResolvedValueOnce(sentQuote);

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => screen.getByRole("button", { name: /versturen/i }));
    fireEvent.click(screen.getByRole("button", { name: /versturen/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/quotes/quote-1/send",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls DELETE /quotes/{id} when Verwijderen is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeDraftQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => screen.getByRole("button", { name: /verwijderen/i }));
    fireEvent.click(screen.getByRole("button", { name: /verwijderen/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/quotes/quote-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});

describe("QuoteDetailPage — sent status actions", () => {
  it("shows Geaccepteerd button for sent quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeSentQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /geaccepteerd/i })).toBeInTheDocument();
    });
  });

  it("shows Afgewezen button for sent quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeSentQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /afgewezen/i })).toBeInTheDocument();
    });
  });

  it("calls POST /quotes/{id}/accept when Geaccepteerd is clicked", async () => {
    const apiFetch = await getApiFetch();
    const acceptedResult = { project_id: "proj-99" };
    apiFetch
      .mockResolvedValueOnce(makeSentQuote())
      .mockResolvedValueOnce(acceptedResult);

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => screen.getByRole("button", { name: /geaccepteerd/i }));
    fireEvent.click(screen.getByRole("button", { name: /geaccepteerd/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/quotes/quote-1/accept",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls POST /quotes/{id}/reject when Afgewezen is clicked", async () => {
    const apiFetch = await getApiFetch();
    const rejectedQuote = { ...makeSentQuote(), status: "rejected" };
    apiFetch
      .mockResolvedValueOnce(makeSentQuote())
      .mockResolvedValueOnce(rejectedQuote);

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => screen.getByRole("button", { name: /afgewezen/i }));
    fireEvent.click(screen.getByRole("button", { name: /afgewezen/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/quotes/quote-1/reject",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows success with link to project after accept", async () => {
    const apiFetch = await getApiFetch();
    const acceptedResult = { project_id: "proj-99" };
    apiFetch
      .mockResolvedValueOnce(makeSentQuote())
      .mockResolvedValueOnce(acceptedResult);

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => screen.getByRole("button", { name: /geaccepteerd/i }));
    fireEvent.click(screen.getByRole("button", { name: /geaccepteerd/i }));

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /project bekijken/i });
      expect(link).toHaveAttribute("href", "/dashboard/projects/proj-99");
    });
  });
});

describe("QuoteDetailPage — accepted status", () => {
  it("does not show draft action buttons for accepted quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeAcceptedQuote());

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /versturen/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /verwijderen/i })).toBeNull();
    });
  });

  it("shows link to associated project for accepted quote", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeAcceptedQuote("proj-123"));

    const { default: QuoteDetailPage } = await import(
      "@/app/dashboard/quotes/[id]/page"
    );
    render(<QuoteDetailPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /project bekijken/i });
      expect(link).toHaveAttribute("href", "/dashboard/projects/proj-123");
    });
  });
});
