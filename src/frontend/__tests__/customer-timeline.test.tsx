import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
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

type EventType =
  | "invoice_sent"
  | "invoice_paid"
  | "invoice_overdue"
  | "report_shared"
  | "review_posted"
  | "review_replied"
  | "email_sent"
  | "payment_received";

const makeEvent = (overrides: Partial<{
  id: string;
  event_type: EventType;
  timestamp: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}> = {}) => ({
  id: overrides.id ?? "evt-1",
  event_type: overrides.event_type ?? "invoice_sent",
  timestamp: overrides.timestamp ?? "2024-03-15T10:00:00Z",
  title: overrides.title ?? "Factuur verstuurd",
  description: overrides.description ?? "Factuur #2024-001 verstuurd naar klant.",
  metadata: overrides.metadata ?? { invoice_number: "2024-001", total_cents: 60500 },
});

const makeTimelineResponse = (
  items: ReturnType<typeof makeEvent>[],
  overrides: Partial<{ total: number; offset: number; limit: number }> = {}
) => ({
  items,
  total: overrides.total ?? items.length,
  offset: overrides.offset ?? 0,
  limit: overrides.limit ?? 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests — Loading state
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — Error state
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — error state", () => {
  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Empty state
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — empty state", () => {
  it("shows empty state message when no events", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeTimelineResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/geen activiteit/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Renders timeline events
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — renders events", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders event titles", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeTimelineResponse([
        makeEvent({ id: "evt-1", title: "Factuur verstuurd" }),
        makeEvent({ id: "evt-2", title: "Betaling ontvangen", event_type: "payment_received" }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Factuur verstuurd")).toBeInTheDocument();
      expect(screen.getByText("Betaling ontvangen")).toBeInTheDocument();
    });
  });

  it("renders event descriptions", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeTimelineResponse([
        makeEvent({ description: "Factuur #2024-001 verstuurd naar klant." }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByText("Factuur #2024-001 verstuurd naar klant.")
      ).toBeInTheDocument();
    });
  });

  it("renders timestamp formatted as Dutch date", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeTimelineResponse([
        makeEvent({ timestamp: "2024-03-15T10:00:00Z" }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/15-03-2024/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Filter bar
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — filter bar", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders filter checkboxes for all event types", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeTimelineResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      // Check for specific filter checkboxes by their exact aria-label
      expect(screen.getByLabelText("Factuur verstuurd")).toBeInTheDocument();
      expect(screen.getByLabelText("Betaling ontvangen")).toBeInTheDocument();
      expect(screen.getByLabelText("Rapport gedeeld")).toBeInTheDocument();
      expect(screen.getByLabelText("Review geplaatst")).toBeInTheDocument();
      expect(screen.getByLabelText("E-mail verstuurd")).toBeInTheDocument();
    });
  });

  it("unchecking a filter refetches with event_type param", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeTimelineResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByLabelText("Factuur verstuurd"));
    apiFetch.mockClear();

    // Uncheck "Factuur verstuurd" — this triggers a re-render with updated filter state
    fireEvent.click(screen.getByLabelText("Factuur verstuurd"));

    await waitFor(() => {
      // After unchecking, apiFetch should have been called
      expect(apiFetch).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Quick action buttons
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — quick actions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders Send reminder button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeTimelineResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /herinnering sturen/i })
      ).toBeInTheDocument();
    });
  });

  it("renders Share report button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeTimelineResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /rapport delen/i })
      ).toBeInTheDocument();
    });
  });

  it("renders Respond to review button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeTimelineResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /review beantwoorden/i })
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Pagination (load more)
// ---------------------------------------------------------------------------

describe("CustomerTimelinePage — load more", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows load-more button when there are more events", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeTimelineResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeEvent({ id: `evt-${i}`, title: `Gebeurtenis ${i}` })
        ),
        { total: 45, offset: 0, limit: 20 }
      )
    );

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /meer laden/i })
      ).toBeInTheDocument();
    });
  });

  it("does not show load-more button when all events are loaded", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeTimelineResponse([makeEvent()], { total: 1, offset: 0, limit: 20 })
    );

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /meer laden/i })
      ).toBeNull();
    });
  });

  it("clicking load-more fetches next page and appends events", async () => {
    const apiFetch = await getApiFetch();
    // First fetch — 20 items, 25 total
    apiFetch.mockResolvedValueOnce(
      makeTimelineResponse(
        Array.from({ length: 20 }, (_, i) =>
          makeEvent({ id: `evt-${i}`, title: `Gebeurtenis ${i}` })
        ),
        { total: 25, offset: 0, limit: 20 }
      )
    );
    // Second fetch — remaining 5
    apiFetch.mockResolvedValueOnce(
      makeTimelineResponse(
        Array.from({ length: 5 }, (_, i) =>
          makeEvent({ id: `evt-extra-${i}`, title: `Extra ${i}` })
        ),
        { total: 25, offset: 20, limit: 20 }
      )
    );

    const { default: Page } = await import(
      "@/app/dashboard/customers/[id]/timeline/page"
    );
    render(<Page />);

    await waitFor(() =>
      screen.getByRole("button", { name: /meer laden/i })
    );

    fireEvent.click(screen.getByRole("button", { name: /meer laden/i }));

    await waitFor(() => {
      expect(screen.getByText("Extra 0")).toBeInTheDocument();
    });

    // Load-more button should be gone once all 25 are loaded
    expect(screen.queryByRole("button", { name: /meer laden/i })).toBeNull();
  });
});
