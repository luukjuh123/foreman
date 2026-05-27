import { describe, it, expect, vi, beforeEach } from "vitest";
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
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Sidebar renders the nav twice (mobile drawer + desktop aside).
// We deduplicate hrefs from the full render to test logical nav structure.

describe("Sidebar — no duplicate hrefs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("NAV_ITEMS has no duplicate hrefs (no /dashboard/financials twice)", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href")).filter(Boolean) as string[];

    // Unique hrefs (each href appears at most twice — once per sidebar instance)
    const hrefCounts: Record<string, number> = {};
    for (const href of hrefs) {
      hrefCounts[href] = (hrefCounts[href] ?? 0) + 1;
    }

    // No href should appear more than 2 times (mobile + desktop = 2 is fine)
    const tripled = Object.entries(hrefCounts).filter(([, count]) => count > 2);
    expect(tripled).toEqual([]);
  });

  it("does not render a 'Boekhouding' label (merged into Financiën)", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    expect(screen.queryByText("Boekhouding")).toBeNull();
  });
});

describe("Sidebar — voice assistant link", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders at least one Spraakassistent link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const voiceLinks = screen.getAllByRole("link", { name: /spraakassistent/i });
    expect(voiceLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("Spraakassistent link points to /dashboard/voice", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const voiceLinks = screen.getAllByRole("link", { name: /spraakassistent/i });
    for (const link of voiceLinks) {
      expect(link).toHaveAttribute("href", "/dashboard/voice");
    }
  });
});

describe("Sidebar — Financiën link still present", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders at least one Financiën link", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link", { name: /financiën/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
