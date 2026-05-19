import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/invoices"),
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
import type { InvoiceListResponse } from "@/lib/types";
import InvoiceListPage from "@/app/dashboard/invoices/page";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const makeLine = (id: string) => ({
  id,
  position: 0,
  description: "Arbeid",
  quantity: 10,
  unit: "uur",
  unit_price_cents: 5000,
  vat_rate_bp: 2100,
  line_net_cents: 50000,
  line_vat_cents: 10500,
});

const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  customer_id: "cust-1",
  project_id: null,
  invoice_number: "2026-0001",
  issue_date: "2026-05-01",
  due_date: "2026-05-31",
  payment_terms_days: 30,
  currency: "EUR",
  status: "draft",
  notes: null,
  subtotal_cents: 50000,
  vat_total_cents: 10500,
  total_cents: 60500,
  sent_at: null,
  paid_at: null,
  lines: [makeLine("line-1")],
  ...overrides,
});

const mockListResponse: InvoiceListResponse = {
  data: [
    makeInvoice({ id: "inv-1", invoice_number: "2026-0001", status: "draft", total_cents: 60500 }),
    makeInvoice({ id: "inv-2", invoice_number: "2026-0002", status: "sent", total_cents: 121000 }),
    makeInvoice({ id: "inv-3", invoice_number: "2026-0003", status: "paid", total_cents: 30000 }),
    makeInvoice({ id: "inv-4", invoice_number: "2026-0004", status: "overdue", total_cents: 45000 }),
  ],
  total: 4,
  page: 1,
  per_page: 20,
};

describe("InvoiceListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue(mockListResponse);
  });

  it("renders invoice list after loading", async () => {
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-0001")).toBeInTheDocument();
    });
    expect(screen.getByText("2026-0002")).toBeInTheDocument();
    expect(screen.getByText("2026-0003")).toBeInTheDocument();
    expect(screen.getByText("2026-0004")).toBeInTheDocument();
  });

  it("displays formatted euro amounts", async () => {
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-0001")).toBeInTheDocument();
    });
    // €605,00 for 60500 cents
    expect(screen.getByText(/605,00/)).toBeInTheDocument();
  });

  it("shows status badges in the table", async () => {
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-0001")).toBeInTheDocument();
    });
    // Filter buttons + table badges both contain these labels; verify multiple exist
    expect(screen.getAllByText("Concept").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Verzonden").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Betaald").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Verlopen").length).toBeGreaterThanOrEqual(2);
  });

  it("filters by status when clicking a filter button", async () => {
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-0001")).toBeInTheDocument();
    });

    mockApiFetch.mockResolvedValue({
      data: [mockListResponse.data[0]],
      total: 1,
      page: 1,
      per_page: 20,
    });

    const draftFilter = screen.getByTestId("filter-draft");
    fireEvent.click(draftFilter);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("status=draft")
      );
    });
  });

  it("shows loading state initially", () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<InvoiceListPage />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockApiFetch.mockRejectedValue(new Error("Network error"));
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it("links to invoice detail page", async () => {
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-0001")).toBeInTheDocument();
    });
    const link = screen.getByText("2026-0001").closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/invoices/inv-1");
  });

  it("has a link to create a new invoice", async () => {
    render(<InvoiceListPage />);
    await waitFor(() => {
      expect(screen.getByText("2026-0001")).toBeInTheDocument();
    });
    const newBtn = screen.getByText(/nieuwe factuur/i);
    const link = newBtn.closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/invoices/new");
  });
});
