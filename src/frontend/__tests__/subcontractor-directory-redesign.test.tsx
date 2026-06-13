import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
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
  specialties: string[];
  hourly_rate_cents: number | null;
  active: boolean;
  certifications: Array<{ name: string; expiry_date: string | null }>;
}> = {}) => ({
  id: overrides.id ?? "sub-1",
  owner_id: "user-1",
  company_name: overrides.company_name ?? "Loodgieters BV",
  kvk_number: "12345678",
  specialties: overrides.specialties ?? ["loodgieter"],
  hourly_rate_cents: overrides.hourly_rate_cents ?? 7500,
  fixed_rate_cents: null,
  certifications: overrides.certifications ?? [],
  rating: null,
  active: overrides.active ?? true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeListResponse = (subs: ReturnType<typeof makeSub>[]) => ({
  data: subs,
  total: subs.length,
  page: 1,
  per_page: 20,
});

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// ---------------------------------------------------------------------------
// Tests: page header
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage redesign — page header", () => {
  beforeEach(() => vi.resetModules());

  it("renders PageHeader with title Onderaannemers", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /onderaannemers/i })).toBeInTheDocument();
    });
  });

  it("renders Toevoegen action button", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /toevoegen/i })).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: skeleton loading
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage redesign — skeleton loading", () => {
  beforeEach(() => vi.resetModules());

  it("shows skeleton while fetching", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockReturnValue(new Promise(() => {}));

    vi.resetModules();
    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: empty state
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage redesign — empty state", () => {
  beforeEach(() => vi.resetModules());

  it("shows empty state when no subcontractors", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/geen onderaannemers/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: card grid rendering
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage redesign — card grid", () => {
  beforeEach(() => vi.resetModules());

  it("renders company names as card titles", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV" }),
        makeSub({ id: "s2", company_name: "Schilder & Zn" }),
      ])
    );

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Loodgieters BV")).toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });

  it("renders specialties as badges", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ specialties: ["loodgieter", "elektricien"] })])
    );

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getAllByText(/loodgieter/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/elektricien/i)).toBeInTheDocument();
    });
  });

  it("renders formatted hourly rate", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ hourly_rate_cents: 8500 })])
    );

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/85,00/)).toBeInTheDocument();
    });
  });

  it("renders active status badge", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([makeSub({ active: true })])
    );

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/actief/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: search by name
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage redesign — search by name", () => {
  beforeEach(() => vi.resetModules());

  it("renders search input", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/zoek/i)).toBeInTheDocument();
    });
  });

  it("filters by name when typing", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(
      makeListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV", specialties: ["loodgieter"] }),
        makeSub({ id: "s2", company_name: "Schilder & Zn", specialties: ["schilder"] }),
      ])
    );

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    await waitFor(() => screen.getByText("Loodgieters BV"));

    fireEvent.change(screen.getByPlaceholderText(/zoek/i), {
      target: { value: "schilder" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Loodgieters BV")).not.toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: existing add/edit dialog still works
// ---------------------------------------------------------------------------

describe("SubcontractorDirectoryPage redesign — add dialog preserved", () => {
  beforeEach(() => vi.resetModules());

  it("opens add dialog when Toevoegen is clicked", async () => {
    const apiFetch = await getApiFetch();
    apiFetch.mockResolvedValue(makeListResponse([]));

    const { default: Page } = await import("@/app/dashboard/subcontractors/page");
    render(<Page />);

    // Empty state shows two Toevoegen buttons; click the first (page header)
    await waitFor(() => screen.getAllByRole("button", { name: /toevoegen/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /toevoegen/i })[0]);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /onderaannemer toevoegen/i })
      ).toBeInTheDocument();
    });
  });
});
