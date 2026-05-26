import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/subcontractors"),
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

const makeSub = (overrides: Partial<{
  id: string;
  company_name: string;
  kvk_number: string;
  specialties: string[];
  hourly_rate_cents: number | null;
  fixed_rate_cents: number | null;
  certifications: Array<{ name: string; expiry_date: string | null }>;
  rating: number | null;
  active: boolean;
}> = {}) => ({
  id: overrides.id ?? "sub-1",
  owner_id: "user-1",
  company_name: overrides.company_name ?? "Loodgieters BV",
  kvk_number: overrides.kvk_number ?? "12345678",
  specialties: overrides.specialties ?? ["loodgieter"],
  hourly_rate_cents: overrides.hourly_rate_cents ?? 7500,
  fixed_rate_cents: overrides.fixed_rate_cents ?? null,
  certifications: overrides.certifications ?? [],
  rating: overrides.rating ?? null,
  active: overrides.active ?? true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeListResponse = (
  subs: ReturnType<typeof makeSub>[],
  overrides: Partial<{ total: number; page: number; per_page: number }> = {}
) => ({
  data: subs,
  total: overrides.total ?? subs.length,
  page: overrides.page ?? 1,
  per_page: overrides.per_page ?? 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: loading state
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — loading state", () => {
  it("shows loading indicator while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    vi.resetModules();
    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: error state
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — error state", () => {
  beforeEach(() => vi.resetModules());

  it("shows error message when fetch fails", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockRejectedValue(new Error("Netwerk fout"));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/netwerk fout/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: empty state
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — empty state", () => {
  beforeEach(() => vi.resetModules());

  it("shows empty state when no subcontractors", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/geen onderaannemers/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: renders list
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — renders list", () => {
  beforeEach(() => vi.resetModules());

  it("renders page heading Onderaannemers", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /onderaannemers/i })
      ).toBeInTheDocument();
    });
  });

  it("renders company names", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV" }),
        makeSub({ id: "s2", company_name: "Schilder & Zn" }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Loodgieters BV")).toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });

  it("renders KVK numbers", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ kvk_number: "87654321" })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("87654321")).toBeInTheDocument();
    });
  });

  it("renders specialties", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ specialties: ["loodgieter", "elektricien"] })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getAllByText(/loodgieter/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/elektricien/i)).toBeInTheDocument();
    });
  });

  it("renders hourly rate formatted as Dutch currency", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ hourly_rate_cents: 8500 })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/85,00/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: certification expiry warnings
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — certification expiry warnings", () => {
  beforeEach(() => vi.resetModules());

  it("shows amber warning badge for cert expiring within 30 days", async () => {
    const apiFetch = await getApiFetch();
    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    const expiryDate = soon.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({
          certifications: [{ name: "VCA", expiry_date: expiryDate }],
        }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("cert-expiry-warning-amber")).toBeInTheDocument();
    });
  });

  it("shows red warning badge for expired cert", async () => {
    const apiFetch = await getApiFetch();
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const expiryDate = past.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({
          certifications: [{ name: "BRL", expiry_date: expiryDate }],
        }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId("cert-expiry-warning-red")).toBeInTheDocument();
    });
  });

  it("shows no warning for cert with expiry > 30 days away", async () => {
    const apiFetch = await getApiFetch();
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const expiryDate = future.toISOString().split("T")[0];

    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({
          certifications: [{ name: "VCA", expiry_date: expiryDate }],
        }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("cert-expiry-warning-amber")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("cert-expiry-warning-red")
      ).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: search/filter
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — search filter", () => {
  beforeEach(() => vi.resetModules());

  it("renders search input", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/zoek/i)).toBeInTheDocument();
    });
  });

  it("filters results by typing in search box", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV", specialties: ["loodgieter"] }),
        makeSub({ id: "s2", company_name: "Schilder & Zn", specialties: ["schilder"] }),
      ])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByText("Loodgieters BV"));

    const searchInput = screen.getByPlaceholderText(/zoek/i);
    fireEvent.change(searchInput, { target: { value: "schilder" } });

    await waitFor(() => {
      expect(screen.queryByText("Loodgieters BV")).not.toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: add/edit dialog
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage — add dialog", () => {
  beforeEach(() => vi.resetModules());

  it("renders Toevoegen button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /toevoegen/i })
      ).toBeInTheDocument();
    });
  });

  it("opens add dialog when Toevoegen is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("button", { name: /toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /onderaannemer toevoegen/i })
      ).toBeInTheDocument();
    });
  });

  it("renders company name input in dialog", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("button", { name: /toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/bedrijfsnaam/i)).toBeInTheDocument();
    });
  });

  it("closes dialog when Annuleren is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByRole("button", { name: /toevoegen/i }));
    fireEvent.click(screen.getByRole("button", { name: /toevoegen/i }));

    await waitFor(() =>
      screen.getByRole("heading", { name: /onderaannemer toevoegen/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /annuleren/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /onderaannemer toevoegen/i })
      ).not.toBeInTheDocument();
    });
  });
});

describe("SubcontractorDirectoryPage — edit dialog", () => {
  beforeEach(() => vi.resetModules());

  it("opens edit dialog when a row is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ company_name: "Loodgieters BV" })])
    );

    const { default: Page } = await import(
      "@/app/dashboard/subcontractors/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByText("Loodgieters BV"));
    fireEvent.click(screen.getByText("Loodgieters BV"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /onderaannemer bewerken/i })
      ).toBeInTheDocument();
    });
  });
});
