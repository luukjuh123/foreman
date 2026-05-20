import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/reviews"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Recharts requires ResizeObserver in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockStats = {
  data: {
    average_rating: 4.2,
    total_count: 37,
    rating_distribution: { "1": 1, "2": 2, "3": 4, "4": 10, "5": 20 },
    monthly_trend: [
      { month: "2024-01", average_rating: 4.0, count: 5 },
      { month: "2024-02", average_rating: 4.5, count: 8 },
    ],
  },
};

const mockReviews = {
  data: [
    {
      id: "rev-1",
      location_id: "loc-1",
      external_id: "ext-1",
      author_name: "Jan de Vries",
      rating: 5,
      comment: "Uitstekend werk!",
      created_at_external: "2024-02-15T10:00:00Z",
      reply_text: null,
      replied_at: null,
    },
    {
      id: "rev-2",
      location_id: "loc-1",
      external_id: "ext-2",
      author_name: "Maria Jansen",
      rating: 3,
      comment: "Goed, maar kon beter.",
      created_at_external: "2024-01-20T09:00:00Z",
      reply_text: "Bedankt voor uw feedback.",
      replied_at: "2024-01-21T08:00:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper: mock apiFetch to return stats + reviews based on URL
// ---------------------------------------------------------------------------

function mockApiFetch(statsResp = mockStats, reviewsResp = mockReviews) {
  return vi.fn().mockImplementation((path: string) => {
    if (path.includes("/reviews/stats")) return Promise.resolve(statsResp);
    if (path.includes("/reviews")) return Promise.resolve(reviewsResp);
    return Promise.reject(new Error("Unknown path"));
  });
}

// ---------------------------------------------------------------------------
// Stats card — renders with mock data
// ---------------------------------------------------------------------------

describe("ReviewsDashboard stats card", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders average rating in stats card", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("stats-average-rating")).toBeInTheDocument();
    });

    expect(screen.getByTestId("stats-average-rating")).toHaveTextContent("4.2");
  });

  it("renders total review count in stats card", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("stats-total-count")).toBeInTheDocument();
    });

    expect(screen.getByTestId("stats-total-count")).toHaveTextContent("37");
  });

  it("renders rating distribution bars for all 5 stars", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("rating-distribution")).toBeInTheDocument();
    });

    // All 5 star rows should be present
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`dist-row-${i}`)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Reviews list — renders review items
// ---------------------------------------------------------------------------

describe("ReviewsDashboard reviews list", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders all review author names", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
      expect(screen.getByText("Maria Jansen")).toBeInTheDocument();
    });
  });

  it("renders review comments", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText("Uitstekend werk!")).toBeInTheDocument();
      expect(screen.getByText("Goed, maar kon beter.")).toBeInTheDocument();
    });
  });

  it("shows replied badge for reviews that have a reply", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("reply-status-rev-2")).toHaveTextContent(/beantwoord/i);
    });
  });

  it("shows unreplied badge for reviews without a reply", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("reply-status-rev-1")).toHaveTextContent(/onbeantwoord/i);
    });
  });

  it("renders star rating for each review", async () => {
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch() }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("review-item-rev-1")).toBeInTheDocument();
      expect(screen.getByTestId("review-item-rev-2")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state — no reviews
// ---------------------------------------------------------------------------

describe("ReviewsDashboard empty state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders empty state when reviews list is empty", async () => {
    const emptyReviews = { data: [] };
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch(mockStats, emptyReviews) }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("reviews-empty")).toBeInTheDocument();
    });
  });

  it("shows empty state message text", async () => {
    const emptyReviews = { data: [] };
    vi.doMock("@/lib/api", () => ({ apiFetch: mockApiFetch(mockStats, emptyReviews) }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("reviews-empty")).toHaveTextContent(/geen reviews/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("ReviewsDashboard loading state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders loading skeleton while fetching", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    render(<ReviewsDashboard />);

    expect(screen.getByTestId("reviews-loading")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("ReviewsDashboard error state", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("renders error message when API fails", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("Netwerk fout")),
    }));

    const { default: ReviewsDashboard } = await import("@/app/dashboard/reviews/page");

    await act(async () => {
      render(<ReviewsDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("reviews-error")).toBeInTheDocument();
    });
  });
});
