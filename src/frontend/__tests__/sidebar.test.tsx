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

describe("Sidebar", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("renders the Overzicht group label", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getAllByText(/overzicht/i).length).toBeGreaterThan(0);
  });

  it("renders the Administratie group label", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getAllByText(/administratie/i).length).toBeGreaterThan(0);
  });

  it("renders the Uitvoering group label", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getAllByText(/uitvoering/i).length).toBeGreaterThan(0);
  });

  it("renders the Financieel group label", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getAllByText(/financieel/i).length).toBeGreaterThan(0);
  });

  it("renders the Overig group label", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getAllByText(/overig/i).length).toBeGreaterThan(0);
  });

  it("renders Dashboard link pointing to /dashboard", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /dashboard/i });
    const dashboardLink = links.find((l) => l.getAttribute("href") === "/dashboard");
    expect(dashboardLink).toBeDefined();
  });

  it("renders Agenda link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const agendaLinks = screen.getAllByRole("link", { name: /agenda/i });
    expect(agendaLinks.some((l) => l.getAttribute("href") === "/dashboard/agenda")).toBe(true);
  });

  it("renders Projecten link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /projecten/i });
    expect(links.some((l) => l.getAttribute("href") === "/dashboard/projects")).toBe(true);
  });

  it("renders Offertes link to /dashboard/quotes", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /offertes/i });
    expect(links.some((l) => l.getAttribute("href") === "/dashboard/quotes")).toBe(true);
  });

  it("renders Klanten link to /dashboard/customers", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /klanten/i });
    expect(links.some((l) => l.getAttribute("href") === "/dashboard/customers")).toBe(true);
  });

  it("renders Facturen link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /facturen/i });
    expect(links.some((l) => l.getAttribute("href") === "/dashboard/invoices")).toBe(true);
  });

  it("renders Processen link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /processen/i });
    expect(links.some((l) => l.getAttribute("href") === "/dashboard/processes")).toBe(true);
  });

  it("renders Instellingen link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const links = screen.getAllByRole("link", { name: /instellingen/i });
    expect(links.some((l) => l.getAttribute("href") === "/dashboard/settings")).toBe(true);
  });

  it("applies active class to Dashboard when pathname is /dashboard", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link", { name: /dashboard/i });
    const dashboardLink = links.find((l) => l.getAttribute("href") === "/dashboard");
    expect(dashboardLink?.className).toMatch(/bg-primary/);
  });

  it("does not apply active class to Dashboard when pathname is /dashboard/projects", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/projects");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link", { name: /dashboard/i });
    const dashboardLink = links.find((l) => l.getAttribute("href") === "/dashboard");
    expect(dashboardLink?.className).not.toMatch(/bg-primary/);
  });

  it("applies active class to Projecten when pathname is /dashboard/projects", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/projects");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link", { name: /projecten/i });
    const projectenLink = links.find((l) => l.getAttribute("href") === "/dashboard/projects");
    expect(projectenLink?.className).toMatch(/bg-primary/);
  });
});
