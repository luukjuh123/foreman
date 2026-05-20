import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/pricing"),
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
// Tests
// ---------------------------------------------------------------------------

describe("PricingPage — tier cards", () => {
  it("renders all three tier cards: Free, Starter, Pro", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    expect(screen.getByRole("heading", { name: /^free$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^starter$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^pro$/i })).toBeInTheDocument();
  });

  it("displays correct prices for Starter and Pro", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    expect(screen.getByText(/€9,99/)).toBeInTheDocument();
    expect(screen.getByText(/€29,99/)).toBeInTheDocument();
  });

  it("displays free price indicator for Free tier", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    // Free tier shows "Gratis" as price — multiple elements may contain "gratis"
    const matches = screen.getAllByText(/gratis/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders CTA buttons for each tier", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    expect(screen.getByRole("button", { name: /start gratis/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kies starter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kies pro/i })).toBeInTheDocument();
  });
});

describe("PricingPage — feature matrix", () => {
  it("shows Free tier features", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    expect(screen.getByText(/1 project/i)).toBeInTheDocument();
  });

  it("shows Starter tier features", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    expect(screen.getByText(/factuur/i)).toBeInTheDocument();
  });

  it("shows Pro tier features including voice AI", async () => {
    const { default: PricingPage } = await import("@/app/pricing/page");
    render(<PricingPage />);

    expect(screen.getByText(/voice/i)).toBeInTheDocument();
  });
});
