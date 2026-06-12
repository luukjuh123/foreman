import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

describe("TopbarBreadcrumb", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("shows 'Dashboard' for /dashboard", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("shows 'Projecten' for /dashboard/projects", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/projects");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Projecten")).toBeInTheDocument();
  });

  it("shows 'Agenda' for /dashboard/agenda", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/agenda");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Agenda")).toBeInTheDocument();
  });

  it("shows 'Facturen' for /dashboard/invoices", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/invoices");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Facturen")).toBeInTheDocument();
  });

  it("shows 'Instellingen' for /dashboard/settings", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/settings");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Instellingen")).toBeInTheDocument();
  });

  it("shows 'Offertes' for /dashboard/quotes", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/quotes");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Offertes")).toBeInTheDocument();
  });

  it("shows 'Klanten' for /dashboard/customers", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/customers");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Klanten")).toBeInTheDocument();
  });

  it("shows 'Financiën' for /dashboard/financials", async () => {
    const { usePathname } = await import("next/navigation");
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue("/dashboard/financials");

    const { TopbarBreadcrumb } = await import("@/components/topbar-breadcrumb");
    render(<TopbarBreadcrumb />);
    expect(screen.getByText("Financiën")).toBeInTheDocument();
  });
});
