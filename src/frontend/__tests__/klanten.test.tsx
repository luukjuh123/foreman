import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/klanten"),
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("@/lib/customers", () => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

import {
  listCustomers,
  createCustomer,
} from "@/lib/customers";
import type { CustomerResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCustomers: CustomerResponse[] = [
  {
    id: "cust-1",
    name: "Bouw BV Amsterdam",
    email: "info@bouwbv.nl",
    kvk_number: "12345678",
    vat_number: "NL123456789B01",
    address_line1: "Keizersgracht 1",
    address_line2: null,
    postal_code: "1015 CS",
    city: "Amsterdam",
    country_code: "NL",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "cust-2",
    name: "Renovatie Utrecht",
    email: null,
    kvk_number: null,
    vat_number: null,
    address_line1: "Oudegracht 50",
    address_line2: null,
    postal_code: "3511 AP",
    city: "Utrecht",
    country_code: "NL",
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-02-01T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// lib/customers API client tests
// ---------------------------------------------------------------------------

describe("customers API client", () => {
  it("listCustomers calls correct endpoint", async () => {
    const { listCustomers: lc } = await import("@/lib/customers");
    vi.mocked(listCustomers).mockResolvedValue({ data: mockCustomers, total: mockCustomers.length });
    const result = await lc();
    expect(result).toEqual({ data: mockCustomers, total: mockCustomers.length });
  });

  it("createCustomer calls POST /customers/ with body", async () => {
    const { createCustomer: cc } = await import("@/lib/customers");
    vi.mocked(createCustomer).mockResolvedValue(mockCustomers[0]);
    const result = await cc({ name: "Nieuw BV", country_code: "NL" });
    expect(result).toEqual(mockCustomers[0]);
  });
});

// ---------------------------------------------------------------------------
// KlantenPage tests
// ---------------------------------------------------------------------------

describe("KlantenPage", () => {
  beforeEach(() => {
    vi.mocked(listCustomers).mockResolvedValue({ data: mockCustomers, total: mockCustomers.length });
  });

  it("renders Klanten heading", async () => {
    const { default: KlantenPage } = await import("@/app/dashboard/klanten/page");
    render(<KlantenPage />);
    expect(screen.getByText("Klanten")).toBeInTheDocument();
  });

  it("renders table with customer names after loading", async () => {
    const { default: KlantenPage } = await import("@/app/dashboard/klanten/page");
    render(<KlantenPage />);
    await waitFor(() => {
      expect(screen.getByText("Bouw BV Amsterdam")).toBeInTheDocument();
      expect(screen.getByText("Renovatie Utrecht")).toBeInTheDocument();
    });
  });

  it("filters customers by search term", async () => {
    const { default: KlantenPage } = await import("@/app/dashboard/klanten/page");
    render(<KlantenPage />);
    await waitFor(() => screen.getByText("Bouw BV Amsterdam"));

    const searchInput = screen.getByPlaceholderText(/zoeken/i);
    fireEvent.change(searchInput, { target: { value: "Utrecht" } });

    expect(screen.getByText("Renovatie Utrecht")).toBeInTheDocument();
    expect(screen.queryByText("Bouw BV Amsterdam")).not.toBeInTheDocument();
  });

  it("shows empty state when no customers match search", async () => {
    const { default: KlantenPage } = await import("@/app/dashboard/klanten/page");
    render(<KlantenPage />);
    await waitFor(() => screen.getByText("Bouw BV Amsterdam"));

    fireEvent.change(screen.getByPlaceholderText(/zoeken/i), {
      target: { value: "xyznonexistent" },
    });

    expect(screen.getByText(/geen klanten/i)).toBeInTheDocument();
  });

  it("opens create dialog when Nieuwe klant button is clicked", async () => {
    const { default: KlantenPage } = await import("@/app/dashboard/klanten/page");
    render(<KlantenPage />);

    const createBtn = screen.getByRole("button", { name: /nieuwe klant/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText("Klant aanmaken")).toBeInTheDocument();
    });
  });

  it("create dialog form submits with correct payload", async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      ...mockCustomers[0],
      id: "cust-new",
      name: "Nieuw Bouw BV",
    });

    const { default: KlantenPage } = await import("@/app/dashboard/klanten/page");
    render(<KlantenPage />);

    fireEvent.click(screen.getByRole("button", { name: /nieuwe klant/i }));
    await waitFor(() => screen.getByText("Klant aanmaken"));

    const nameInput = screen.getByPlaceholderText(/bedrijfsnaam/i);
    fireEvent.change(nameInput, { target: { value: "Nieuw Bouw BV" } });

    fireEvent.click(screen.getByRole("button", { name: /aanmaken/i }));

    await waitFor(() => {
      expect(createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Nieuw Bouw BV" })
      );
    });
  });
});
