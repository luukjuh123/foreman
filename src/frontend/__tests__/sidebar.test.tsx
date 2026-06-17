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

// ─── All nav items are rendered ───────────────────────────────────────────────

describe("Sidebar — nav items", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  const items: [string, string][] = [
    ["Dashboard", "/dashboard"],
    ["Projecten", "/dashboard/projects"],
    ["Contracten", "/dashboard/contracts"],
    ["Klanten", "/dashboard/customers"],
    ["Agenda", "/dashboard/agenda"],
    ["Facturen", "/dashboard/invoices"],
    ["Financiën", "/dashboard/financials"],
    ["BTW Aangifte", "/dashboard/btw"],
    ["Materialen", "/dashboard/materials"],
    ["Processen", "/dashboard/processes"],
    ["Personeel", "/dashboard/staff"],
    ["Onderaannemers", "/dashboard/subcontractors"],
    ["Rapporten", "/dashboard/reports"],
    ["Reviews", "/dashboard/reviews"],
    ["Instellingen", "/dashboard/settings"],
  ];

  for (const [label, href] of items) {
    it(`renders "${label}" link pointing to ${href}`, async () => {
      const { default: Sidebar } = await import("@/components/sidebar");
      render(<Sidebar />);
      const links = screen
        .getAllByRole("link", { name: new RegExp(label, "i") })
        .filter((el) => el.getAttribute("href") === href);
      expect(links.length).toBeGreaterThanOrEqual(1);
    });
  }
});

// ─── Active-state logic ───────────────────────────────────────────────────────

describe("Sidebar — active-state logic", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("highlights Dashboard on exact /dashboard match", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const activeLinks = screen
      .getAllByRole("link", { name: /^dashboard$/i })
      .filter((el) => el.getAttribute("href") === "/dashboard");
    expect(activeLinks.some((el) => el.className.includes("bg-primary"))).toBe(true);
  });

  it("does NOT highlight Dashboard on nested route /dashboard/projects", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/projects");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const dashboardLinks = screen
      .getAllByRole("link", { name: /^dashboard$/i })
      .filter((el) => el.getAttribute("href") === "/dashboard");
    expect(dashboardLinks.every((el) => !el.className.includes("bg-primary"))).toBe(true);
  });

  it("highlights Facturen when pathname is /dashboard/invoices", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/invoices");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const facturenLinks = screen
      .getAllByRole("link", { name: /facturen/i })
      .filter((el) => el.getAttribute("href") === "/dashboard/invoices");
    expect(facturenLinks.some((el) => el.className.includes("bg-primary"))).toBe(true);
  });

  it("highlights Facturen on nested route /dashboard/invoices/123", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/invoices/123");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const facturenLinks = screen
      .getAllByRole("link", { name: /facturen/i })
      .filter((el) => el.getAttribute("href") === "/dashboard/invoices");
    expect(facturenLinks.some((el) => el.className.includes("bg-primary"))).toBe(true);
  });

  it("does NOT highlight Dashboard on /dashboard/invoices/123", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/invoices/123");

    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const dashboardLinks = screen
      .getAllByRole("link", { name: /^dashboard$/i })
      .filter((el) => el.getAttribute("href") === "/dashboard");
    expect(dashboardLinks.every((el) => !el.className.includes("bg-primary"))).toBe(true);
  });
});

// ─── Mobile toggle ────────────────────────────────────────────────────────────

describe("Sidebar — mobile toggle", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders a Toggle menu button", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: /toggle menu/i })).toBeInTheDocument();
  });

  it("mobile drawer is hidden by default (translate-x-full or similar)", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    const { container } = render(<Sidebar />);
    const mobileAside = container.querySelector("aside.fixed");
    expect(mobileAside?.className).toMatch(/-translate-x-full/);
  });

  it("mobile drawer opens when toggle button is clicked", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    const { container } = render(<Sidebar />);

    const btn = screen.getByRole("button", { name: /toggle menu/i });
    fireEvent.click(btn);

    const mobileAside = container.querySelector("aside.fixed");
    expect(mobileAside?.className).not.toMatch(/-translate-x-full/);
  });

  it("clicking a nav item in mobile drawer closes it", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    const { container } = render(<Sidebar />);

    // Open
    fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));

    // Click any link inside the mobile aside
    const mobileAside = container.querySelector("aside.fixed");
    const firstLink = mobileAside?.querySelector("a");
    if (firstLink) {
      fireEvent.click(firstLink);
      expect(mobileAside?.className).toMatch(/-translate-x-full/);
    }
  });
});

// ─── App name header ──────────────────────────────────────────────────────────

describe("Sidebar — header", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("renders Foreman app name in the header area", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const names = screen.getAllByText(/foreman/i);
    expect(names.length).toBeGreaterThanOrEqual(1);
  });
});
