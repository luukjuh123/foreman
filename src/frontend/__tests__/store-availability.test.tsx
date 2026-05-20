import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/materials/availability"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResults = [
  {
    store: "hornbach",
    product_id: "h-001",
    name: "Spijker 40mm (1kg)",
    url: "https://www.hornbach.nl/p/spijker/h-001/",
    price_cents: 499,
    in_stock: true,
    unit: "piece",
  },
  {
    store: "gamma",
    product_id: "g-002",
    name: "Schroef 50mm (100x)",
    url: "https://www.gamma.nl/assortiment/p/schroef/g-002",
    price_cents: 899,
    in_stock: false,
    unit: "piece",
  },
  {
    store: "praxis",
    product_id: "p-003",
    name: "Spijker universeel 40mm",
    url: "https://www.praxis.nl/bouwmaterialen/p/spijker/p-003",
    price_cents: 349,
    in_stock: true,
    unit: "piece",
  },
];

const emptyResponse = { data: [], error: null, query: "notfound" };
const successResponse = { data: mockResults, error: null, query: "spijker" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StoreAvailabilityPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("renders the search input", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    render(<Page />);

    expect(screen.getByTestId("availability-search-input")).toBeInTheDocument();
  });

  it("renders the page heading in Dutch", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    render(<Page />);

    expect(screen.getByText("Beschikbaarheid per Winkel")).toBeInTheDocument();
  });

  it("renders a search button labeled Zoeken", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    render(<Page />);

    expect(screen.getByTestId("availability-search-button")).toBeInTheDocument();
    expect(screen.getByTestId("availability-search-button").textContent).toContain(
      "Zoeken"
    );
  });

  it("shows loading indicator while fetching", async () => {
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    render(<Page />);

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });
    fireEvent.click(screen.getByTestId("availability-search-button"));

    expect(screen.getByTestId("availability-loading")).toBeInTheDocument();
  });

  it("shows product cards after a successful search", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      expect(screen.getByText("Spijker 40mm (1kg)")).toBeInTheDocument();
    });

    expect(screen.getByText("Schroef 50mm (100x)")).toBeInTheDocument();
    expect(screen.getByText("Spijker universeel 40mm")).toBeInTheDocument();
  });

  it("shows green in-stock badge for in_stock=true products", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      const badges = screen.getAllByTestId("stock-badge-instock");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("shows red out-of-stock badge for in_stock=false products", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      const badges = screen.getAllByTestId("stock-badge-outofstock");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("shows price formatted in euro for each product", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    // 499 cents = €4,99
    await waitFor(() => {
      expect(screen.getByText(/4,99/)).toBeInTheDocument();
    });
  });

  it("shows store name on each product card", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      const matches = screen.getAllByText(/hornbach/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("shows empty results message when no products returned", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(emptyResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "notfound" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("availability-empty")).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    const apiFetchMock = vi.fn().mockRejectedValue(new Error("Netwerkfout"));

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("availability-error")).toBeInTheDocument();
    });
  });

  it("links each product card to the store URL", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      const link = screen.getByText("Spijker 40mm (1kg)").closest("a");
      expect(link).toHaveAttribute("href", "https://www.hornbach.nl/p/spijker/h-001/");
    });
  });

  it("calls apiFetch with correct search query", async () => {
    const apiFetchMock = vi.fn().mockResolvedValue(successResponse);

    vi.doMock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

    const { default: Page } = await import(
      "@/app/dashboard/materials/availability/page"
    );

    await act(async () => {
      render(<Page />);
    });

    const input = screen.getByTestId("availability-search-input");
    fireEvent.change(input, { target: { value: "spijker" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("availability-search-button"));
    });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining("spijker")
      );
    });
  });
});
