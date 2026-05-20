import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

describe("MobileNav", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("renders 5 tab buttons", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    // 5 tabs: Dashboard, Projecten, Agenda, Meldingen, Meer
    const links = screen.getAllByRole("link");
    // At minimum 4 direct links + 1 button for Meer
    expect(links.length + screen.getAllByRole("button").length).toBeGreaterThanOrEqual(5);
  });

  it("renders Dashboard tab with link to /dashboard", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  it("renders Projecten tab with link to /dashboard/projects", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const projectenLink = screen.getByRole("link", { name: /projecten/i });
    expect(projectenLink).toHaveAttribute("href", "/dashboard/projects");
  });

  it("renders Agenda tab with link to /dashboard/agenda", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const agendaLink = screen.getByRole("link", { name: /agenda/i });
    expect(agendaLink).toHaveAttribute("href", "/dashboard/agenda");
  });

  it("renders Meldingen tab with link to /dashboard/notifications", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const meldingenLink = screen.getByRole("link", { name: /meldingen/i });
    expect(meldingenLink).toHaveAttribute("href", "/dashboard/notifications");
  });

  it("renders a Meer button", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const meerButton = screen.getByRole("button", { name: /meer/i });
    expect(meerButton).toBeInTheDocument();
  });

  it("highlights Dashboard tab when pathname is /dashboard", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard");

    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    // Active tab should have primary color class
    expect(dashboardLink.className).toMatch(/text-primary/);
  });

  it("does not highlight Dashboard tab when pathname is /dashboard/projects", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/projects");

    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink.className).not.toMatch(/text-primary/);
  });

  it("opens sheet with more nav items when Meer is clicked", async () => {
    const { default: MobileNav } = await import("@/components/mobile-nav");
    render(<MobileNav />);

    const meerButton = screen.getByRole("button", { name: /meer/i });
    fireEvent.click(meerButton);

    // Sheet should show additional nav items
    expect(screen.getByText(/facturen/i)).toBeInTheDocument();
  });
});
