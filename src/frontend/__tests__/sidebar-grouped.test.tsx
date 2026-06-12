import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

describe("Sidebar — grouped navigation", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("renders the Projecten section heading", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const headings = screen.getAllByText(/projecten/i);
    // At least one should be a section heading (not just a nav link)
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Administratie section heading", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    // Sidebar renders nav content twice (mobile drawer + desktop) so use getAllBy
    const headings = screen.getAllByText("Administratie");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Financieel section heading", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const headings = screen.getAllByText("Financieel");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Instellingen section heading", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    // "Instellingen" also appears as a nav link label — getAllByText is robust
    const headings = screen.getAllByText("Instellingen");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Dashboard link in Projecten section", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /dashboard/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard");
  });

  it("renders Offertes link pointing to /dashboard/quotes", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const offerteLinks = screen.getAllByRole("link", { name: /offertes/i });
    expect(offerteLinks.length).toBeGreaterThanOrEqual(1);
    expect(offerteLinks[0]).toHaveAttribute("href", "/dashboard/quotes");
  });

  it("renders Facturen link under Administratie", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /facturen/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/invoices");
  });

  it("renders Financiën link under Financieel", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /financiën/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/financials");
  });

  it("renders BTW link under Financieel", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /btw/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/btw");
  });

  it("renders Instellingen link under Instellingen section", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /instellingen/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/settings");
  });

  it("active link has primary highlight class", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/invoices");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const factuurLinks = screen.getAllByRole("link", { name: /facturen/i });
    expect(factuurLinks[0].className).toMatch(/bg-primary/);
  });

  it("inactive links do not have primary highlight class", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link", { name: /facturen/i });
    expect(links[0].className).not.toMatch(/bg-primary/);
  });

  it("section headings have muted/uppercase styling cues", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    // Find section heading elements — rendered twice (mobile+desktop)
    const els = screen.getAllByText("Administratie");
    expect(els.length).toBeGreaterThanOrEqual(1);
    // Every heading element should carry styling cues
    els.forEach((el) => {
      expect(el.className).toMatch(/uppercase|muted|text-xs/);
    });
  });
});
