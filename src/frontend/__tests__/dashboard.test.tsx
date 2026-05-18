import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  logout: vi.fn(),
}));

describe("Sidebar", () => {
  it("renders all navigation links", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Agenda")).toBeInTheDocument();
    expect(screen.getByText("Materials")).toBeInTheDocument();
    expect(screen.getByText("Financials")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders the Foreman brand", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    expect(screen.getByText("Foreman")).toBeInTheDocument();
  });

  it("links point to correct hrefs", async () => {
    const { Sidebar } = await import("@/components/sidebar");
    render(<Sidebar />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
    const projectsLink = screen.getByText("Projects").closest("a");
    expect(projectsLink).toHaveAttribute("href", "/projects");
  });
});

describe("Header", () => {
  it("renders theme toggle and logout buttons", async () => {
    const { Header } = await import("@/components/header");
    render(<Header />);
    expect(screen.getByLabelText("Toggle theme")).toBeInTheDocument();
    expect(screen.getByLabelText("Logout")).toBeInTheDocument();
  });
});

describe("DashboardPage", () => {
  it("renders stat cards", async () => {
    const { default: DashboardPage } = await import("@/app/(dashboard)/dashboard/page");
    render(<DashboardPage />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Tasks This Week")).toBeInTheDocument();
    expect(screen.getByText("Materials Tracked")).toBeInTheDocument();
    expect(screen.getByText("Total Budget")).toBeInTheDocument();
  });
});
