import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/materials"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Shared mock helper
// ---------------------------------------------------------------------------

function mockMaterials(
  searchMaterials: ReturnType<typeof vi.fn>,
  fetchStores: ReturnType<typeof vi.fn>
) {
  vi.doMock("@/lib/materials", () => ({
    searchMaterials,
    fetchStores,
    formatPriceCents: (cents: number) =>
      new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }).format(cents / 100),
  }));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSearchResults = {
  data: [
    {
      store: "hornbach",
      product_id: "h-001",
      name: "Muurverf Wit 2.5L",
      url: "https://hornbach.nl/p/h-001",
      price_cents: 1499,
      in_stock: true,
      unit: "piece",
    },
    {
      store: "gamma",
      product_id: "g-001",
      name: "Muurverf Wit 2.5L",
      url: "https://gamma.nl/p/g-001",
      price_cents: 1699,
      in_stock: false,
      unit: "piece",
    },
    {
      store: "praxis",
      product_id: "p-001",
      name: "Muurverf Wit 2.5L",
      url: "https://praxis.nl/p/p-001",
      price_cents: 1399,
      in_stock: true,
      unit: "piece",
    },
    {
      store: "bouwmaat",
      product_id: "b-001",
      name: "Muurverf Wit 2.5L",
      url: "https://bouwmaat.nl/p/b-001",
      price_cents: 1599,
      in_stock: true,
      unit: "piece",
    },
  ],
  error: null,
};

const mockStores = {
  data: ["hornbach", "gamma", "praxis", "bouwmaat"],
  error: null,
};

const mockEmptyResults = {
  data: [],
  error: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MaterialsSearchPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("renders the search input", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockEmptyResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    expect(screen.getByTestId("materials-search-input")).toBeInTheDocument();
  });

  it("shows loading state during search", async () => {
    let resolveSearch!: (v: typeof mockSearchResults) => void;
    const pendingSearch = new Promise<typeof mockSearchResults>((res) => {
      resolveSearch = res;
    });

    mockMaterials(
      vi.fn().mockReturnValue(pendingSearch),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    render(<Page />);

    // Wait for stores to load
    await act(async () => {});

    // Type in search box — this schedules a 300ms debounce
    const input = screen.getByTestId("materials-search-input");

    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    // Advance past debounce using real timers (vitest fake timers + react 18 = tricky)
    // Instead, wait for the loading state to appear after real debounce
    await waitFor(
      () => {
        expect(screen.getByTestId("materials-loading")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    // Cleanup — resolve the pending promise to avoid unhandled rejections
    await act(async () => {
      resolveSearch(mockSearchResults);
    });
  });

  it("displays results in comparison table after search", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("materials-results-table")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    const rows = screen.getAllByTestId("materials-result-row");
    expect(rows).toHaveLength(4);
  });

  it("shows in-stock badge for in-stock items", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        const badges = screen.getAllByTestId("badge-in-stock");
        expect(badges.length).toBeGreaterThan(0);
        expect(badges[0]).toHaveTextContent("Op voorraad");
      },
      { timeout: 1000 }
    );
  });

  it("shows out-of-stock badge for out-of-stock items", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        const badges = screen.getAllByTestId("badge-out-of-stock");
        expect(badges.length).toBeGreaterThan(0);
        expect(badges[0]).toHaveTextContent("Niet op voorraad");
      },
      { timeout: 1000 }
    );
  });

  it("shows store badges with correct store names", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("store-badge-hornbach")).toBeInTheDocument();
        expect(screen.getByTestId("store-badge-gamma")).toBeInTheDocument();
        expect(screen.getByTestId("store-badge-praxis")).toBeInTheDocument();
        expect(screen.getByTestId("store-badge-bouwmaat")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it("filters results when a store filter chip is toggled off", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        expect(screen.getAllByTestId("materials-result-row")).toHaveLength(4);
      },
      { timeout: 1000 }
    );

    // Toggle off hornbach
    await act(async () => {
      fireEvent.click(screen.getByTestId("store-filter-hornbach"));
    });

    expect(screen.getAllByTestId("materials-result-row")).toHaveLength(3);
  });

  it("formats prices in Dutch euro locale", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        // Praxis cheapest in-stock: 1399 cents = €13,99
        const prices = screen.getAllByTestId("result-price");
        const texts = prices.map((p) => p.textContent ?? "");
        expect(texts.some((t) => t.includes("13,99"))).toBe(true);
      },
      { timeout: 1000 }
    );
  });

  it("shows empty state when no results are returned", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockEmptyResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "onbekendproduct" } });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("materials-empty-state")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it("sorts results cheapest first with in-stock items prioritized", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        const rows = screen.getAllByTestId("materials-result-row");
        // First row should be cheapest in-stock: praxis at 1399 cents
        expect(rows[0]).toHaveAttribute("data-store", "praxis");
      },
      { timeout: 1000 }
    );
  });

  it("product name links open in new tab", async () => {
    mockMaterials(
      vi.fn().mockResolvedValue(mockSearchResults),
      vi.fn().mockResolvedValue(mockStores)
    );

    const { default: Page } = await import("@/app/dashboard/materials/page");

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("materials-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "verf" } });
    });

    await waitFor(
      () => {
        const links = screen.getAllByTestId("result-product-link");
        expect(links[0]).toHaveAttribute("target", "_blank");
      },
      { timeout: 1000 }
    );
  });
});
