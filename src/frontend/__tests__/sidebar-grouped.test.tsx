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

describe("Sidebar — flat navigation", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("renders Projecten link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /projecten/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/projects");
  });

  it("renders Facturen link pointing to /dashboard/invoices", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /facturen/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/invoices");
  });

  it("renders Financiën link pointing to /dashboard/financials", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /financiën/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/financials");
  });

  it("renders BTW link under /dashboard/btw", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /btw/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard/btw");
  });

  it("renders Instellingen link under /dashboard/settings", async () => {
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

  it("renders Foreman app name in the header area", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const names = screen.getAllByText(/foreman/i);
    expect(names.length).toBeGreaterThanOrEqual(1);
  });
});
