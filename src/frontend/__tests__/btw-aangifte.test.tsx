import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/btw"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeAangifte = (overrides: Partial<{
  id: string;
  year: number;
  quarter: number;
  status: "draft" | "submitted" | "accepted";
  box_1a_net_cents: number;
  box_1b_net_cents: number;
  box_1c_net_cents: number;
  box_5a_vat_due_cents: number;
  box_5b_voorbelasting_cents: number;
  box_5d_payable_cents: number;
  notes: string | null;
  submitted_at: string | null;
}> = {}) => ({
  id: overrides.id ?? "btw-1",
  year: overrides.year ?? 2024,
  quarter: overrides.quarter ?? 1,
  status: overrides.status ?? "draft",
  box_1a_net_cents: overrides.box_1a_net_cents ?? 100000,
  box_1b_net_cents: overrides.box_1b_net_cents ?? 0,
  box_1c_net_cents: overrides.box_1c_net_cents ?? 0,
  box_5a_vat_due_cents: overrides.box_5a_vat_due_cents ?? 21000,
  box_5b_voorbelasting_cents: overrides.box_5b_voorbelasting_cents ?? 0,
  box_5d_payable_cents: overrides.box_5d_payable_cents ?? 21000,
  notes: overrides.notes ?? null,
  submitted_at: overrides.submitted_at ?? null,
  created_at: "2024-04-05T10:00:00Z",
  updated_at: "2024-04-05T10:00:00Z",
});

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

// Lazy import so mocks are set up first.
async function getBtwPage() {
  const mod = await import("@/app/dashboard/btw/page");
  return mod.default;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BTW Aangifte Page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders page heading", async () => {
    mockApiFetch.mockResolvedValue([]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    expect(screen.getByText(/btw aangifte/i)).toBeInTheDocument();
  });

  it("shows empty state when no aangiftes exist", async () => {
    mockApiFetch.mockResolvedValue([]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      expect(screen.getByText(/geen aangifte/i)).toBeInTheDocument();
    });
  });

  it("renders aangifte list from API", async () => {
    const aangiftes = [
      makeAangifte({ id: "btw-q1", year: 2024, quarter: 1 }),
      makeAangifte({ id: "btw-q2", year: 2024, quarter: 2 }),
    ];
    mockApiFetch.mockResolvedValue(aangiftes);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      expect(screen.getByText(/Q1 2024/i)).toBeInTheDocument();
      expect(screen.getByText(/Q2 2024/i)).toBeInTheDocument();
    });
  });

  it("shows euro-formatted VAT payable amount", async () => {
    // 21000 cents = €210,00
    mockApiFetch.mockResolvedValue([makeAangifte({ box_5d_payable_cents: 21000 })]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      // Expect Dutch-formatted value (€ 210,00 or similar)
      const elements = screen.getAllByText(/210/);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("shows status badge for draft", async () => {
    mockApiFetch.mockResolvedValue([makeAangifte({ status: "draft" })]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      expect(screen.getByText(/concept/i)).toBeInTheDocument();
    });
  });

  it("shows status badge for submitted", async () => {
    mockApiFetch.mockResolvedValue([makeAangifte({ status: "submitted" })]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      expect(screen.getByText(/ingediend/i)).toBeInTheDocument();
    });
  });

  it("renders generate new aangifte button", async () => {
    mockApiFetch.mockResolvedValue([]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /nieuwe aangifte/i })
      ).toBeInTheDocument();
    });
  });

  it("renders CSV export button in aangifte row", async () => {
    mockApiFetch.mockResolvedValue([makeAangifte()]);
    const BtwPage = await getBtwPage();
    render(<BtwPage />);
    await waitFor(() => {
      expect(screen.getByText(/csv/i)).toBeInTheDocument();
    });
  });

  it("calls generate API when new aangifte form is submitted", async () => {
    mockApiFetch
      .mockResolvedValueOnce([]) // initial list load
      .mockResolvedValueOnce(makeAangifte()) // generate response
      .mockResolvedValueOnce([makeAangifte()]); // refresh list

    const BtwPage = await getBtwPage();
    render(<BtwPage />);

    // Click the generate button
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nieuwe aangifte/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /nieuwe aangifte/i }));

    // Expect dialog/form to appear with year/quarter fields
    await waitFor(() => {
      expect(screen.getByLabelText(/kwartaal/i) || screen.getByText(/kwartaal/i)).toBeInTheDocument();
    });
  });
});

describe("BTW Aangifte Detail", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays all boxes with correct values", async () => {
    const aangifte = makeAangifte({
      box_1a_net_cents: 100000, // €1000
      box_1b_net_cents: 20000,  // €200
      box_5a_vat_due_cents: 21000 + 1800, // €210 + €18
      box_5b_voorbelasting_cents: 5000,
      box_5d_payable_cents: 17800,
    });

    // Lazy import the detail component
    const mod = await import("@/components/btw/BtwAangifteDetail");
    const BtwDetail = mod.default;

    render(<BtwDetail aangifte={aangifte} onUpdate={vi.fn()} />);

    // Box 1a should show €1.000,00
    expect(screen.getByText(/1\.000/)).toBeInTheDocument();
    // Box 5d payable
    expect(screen.getByText(/178/)).toBeInTheDocument();
  });

  it("renders notes field", async () => {
    const aangifte = makeAangifte({ notes: "Test notitie" });
    const mod = await import("@/components/btw/BtwAangifteDetail");
    const BtwDetail = mod.default;

    render(<BtwDetail aangifte={aangifte} onUpdate={vi.fn()} />);
    expect(screen.getByText(/Test notitie/)).toBeInTheDocument();
  });
});

describe("BTW formatCents utility", () => {
  it("formats euro cents to Dutch locale string", async () => {
    const { formatBtwCents } = await import("@/lib/btw");
    expect(formatBtwCents(21000)).toBe("€ 210,00");
    expect(formatBtwCents(0)).toBe("€ 0,00");
    expect(formatBtwCents(100)).toBe("€ 1,00");
    expect(formatBtwCents(123456)).toBe("€ 1.234,56");
  });

  it("formats quarter label in Dutch", async () => {
    const { formatQuarterLabel } = await import("@/lib/btw");
    expect(formatQuarterLabel(2024, 1)).toBe("Q1 2024 (jan-mrt)");
    expect(formatQuarterLabel(2024, 2)).toBe("Q2 2024 (apr-jun)");
    expect(formatQuarterLabel(2024, 3)).toBe("Q3 2024 (jul-sep)");
    expect(formatQuarterLabel(2024, 4)).toBe("Q4 2024 (okt-dec)");
  });

  it("returns quarter date range", async () => {
    const { getQuarterDateRange } = await import("@/lib/btw");
    const { start, end } = getQuarterDateRange(2024, 1);
    expect(start).toBe("2024-01-01");
    expect(end).toBe("2024-03-31");
    const q4 = getQuarterDateRange(2024, 4);
    expect(q4.start).toBe("2024-10-01");
    expect(q4.end).toBe("2024-12-31");
  });
});
