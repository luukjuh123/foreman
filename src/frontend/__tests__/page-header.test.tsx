import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

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

describe("PageHeader", () => {
  it("renders the title", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(<PageHeader title="Facturen" />);
    expect(screen.getByRole("heading", { name: "Facturen" })).toBeInTheDocument();
  });

  it("renders optional description when provided", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(
      <PageHeader title="Personeel" description="Beheer uw medewerkers" />
    );
    expect(screen.getByText("Beheer uw medewerkers")).toBeInTheDocument();
  });

  it("does not render description paragraph when omitted", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(<PageHeader title="Financiën" />);
    expect(screen.queryByText(/beheer/i)).not.toBeInTheDocument();
  });

  it("renders breadcrumbs when provided", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(
      <PageHeader
        title="Facturen"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administratie" },
          { label: "Facturen" },
        ]}
      />
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Administratie")).toBeInTheDocument();
    // Last breadcrumb rendered (may be non-link)
    const factuurEls = screen.getAllByText("Facturen");
    expect(factuurEls.length).toBeGreaterThanOrEqual(1);
  });

  it("breadcrumb with href renders as a link", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(
      <PageHeader
        title="Facturen"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Facturen" },
        ]}
      />
    );
    // Dashboard is not the last item so it renders as <a>
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders action button slot when provided", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(
      <PageHeader
        title="Personeel"
        action={<button>Toevoegen</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Toevoegen" })).toBeInTheDocument();
  });

  it("does not render action slot when omitted", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(<PageHeader title="Financiën" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("title is rendered as an h1 element", async () => {
    const { PageHeader } = await import("@/components/page-header");
    render(<PageHeader title="Onderaannemers" />);
    const h1 = document.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe("Onderaannemers");
  });
});
