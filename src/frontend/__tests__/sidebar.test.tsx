import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
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

  it("renders Financiën link pointing to /dashboard/financials exactly once per aside", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    // Sidebar renders mobile + desktop asides, so each link appears twice in total.
    // Verify that within a single aside the href appears exactly once.
    const asides = document.querySelectorAll("aside");
    const desktopAside = asides[1];
    const financialsLinks = desktopAside.querySelectorAll(
      'a[href="/dashboard/financials"]'
    );
    expect(financialsLinks).toHaveLength(1);
  });

  it("does not render a Boekhouding link (duplicate removed)", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const boekhoudingLinks = screen.queryAllByText(/boekhouding/i);
    expect(boekhoudingLinks).toHaveLength(0);
  });

  it("renders Financiën link with label Financiën", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const financienLinks = screen.getAllByText(/financiën/i);
    expect(financienLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Spraakassistent link pointing to /dashboard/voice", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    const links = screen.getAllByRole("link");
    const voiceLink = links.find(
      (l) => l.getAttribute("href") === "/dashboard/voice"
    );
    expect(voiceLink).toBeDefined();
  });

  it("renders Spraakassistent label text", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    // Two asides (mobile + desktop) so the label appears twice — use getAllByText.
    const labels = screen.getAllByText(/spraakassistent/i);
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("has no duplicate hrefs in nav items", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);

    // Sidebar renders two <aside> elements (mobile + desktop) so each link appears twice.
    // Check that within a single aside the hrefs are unique.
    const asides = document.querySelectorAll("aside");
    // Use the desktop aside (second one, hidden on mobile)
    const desktopAside = asides[1];
    const anchors = desktopAside.querySelectorAll("a");
    const hrefs = Array.from(anchors).map((a) => a.getAttribute("href"));
    const uniqueHrefs = new Set(hrefs);
    expect(hrefs.length).toBe(uniqueHrefs.size);
  });
});
