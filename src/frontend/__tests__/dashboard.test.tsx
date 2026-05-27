import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// Mock window.matchMedia (not available in jsdom)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

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

// ---------------------------------------------------------------------------
// ThemeProvider + useTheme
// ---------------------------------------------------------------------------

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset html class
    document.documentElement.className = "";
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  it("renders children", async () => {
    const { ThemeProvider } = await import("@/lib/theme-provider");
    render(
      <ThemeProvider>
        <div data-testid="child">hello</div>
      </ThemeProvider>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hello");
  });

  it("defaults to system theme when no localStorage value", async () => {
    vi.resetModules();
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");

    function Consumer() {
      const { theme } = useTheme();
      return <div data-testid="theme">{theme}</div>;
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
  });

  it("reads theme from localStorage on mount", async () => {
    localStorage.setItem("foreman_theme", "dark");
    vi.resetModules();
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");

    function Consumer() {
      const { theme } = useTheme();
      return <div data-testid="theme">{theme}</div>;
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("setTheme persists to localStorage and updates state", async () => {
    vi.resetModules();
    const { ThemeProvider, useTheme } = await import("@/lib/theme-provider");

    function Consumer() {
      const { theme, setTheme } = useTheme();
      return (
        <>
          <div data-testid="theme">{theme}</div>
          <button onClick={() => setTheme("light")}>set light</button>
        </>
      );
    }

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    act(() => {
      screen.getByText("set light").click();
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(localStorage.getItem("foreman_theme")).toBe("light");
  });

  it("applies dark class to html element when theme is dark", async () => {
    localStorage.setItem("foreman_theme", "dark");
    vi.resetModules();
    const { ThemeProvider } = await import("@/lib/theme-provider");

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class from html element when theme is light", async () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("foreman_theme", "light");
    vi.resetModules();
    const { ThemeProvider } = await import("@/lib/theme-provider");

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  it("renders a toggle button", async () => {
    const { ThemeProvider } = await import("@/lib/theme-provider");
    const { ThemeToggle } = await import("@/components/theme-toggle");

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

describe("Sidebar", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders all navigation links", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");

    render(<Sidebar />);

    // Sidebar renders both mobile and desktop navs — use getAllByText
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Projecten").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agenda").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Facturen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Materialen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Personeel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rapporten").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Instellingen").length).toBeGreaterThan(0);
  });

  it("renders correct hrefs for nav links", async () => {
    const { default: Sidebar } = await import("@/components/sidebar");

    render(<Sidebar />);

    // Multiple links exist (mobile + desktop) — check first occurrence
    const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
    expect(dashboardLinks[0]).toHaveAttribute("href", "/dashboard");

    const projectenLinks = screen.getAllByRole("link", { name: /projecten/i });
    expect(projectenLinks[0]).toHaveAttribute("href", "/dashboard/projects");

    const instellingenLinks = screen.getAllByRole("link", { name: /instellingen/i });
    expect(instellingenLinks[0]).toHaveAttribute("href", "/dashboard/settings");
  });
});

// ---------------------------------------------------------------------------
// Dashboard home page
// ---------------------------------------------------------------------------

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  const mockStatsResponse = {
    active_projects: 0,
    overdue_tasks: 0,
    monthly_revenue_cents: 0,
    outstanding_cents: 0,
    staff_utilization_pct: 0.0,
  };

  const fmtBudget = (cents: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100);

  it("renders welcome message", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockStatsResponse),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByText(/welkom bij foreman/i)).toBeInTheDocument();
  });

  it("shows loading skeleton while fetching", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    render(<DashboardPage />);

    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockRejectedValue(new Error("network error")),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("dashboard-error")).toBeInTheDocument();
  });

  it("renders all five KPI stat cards after loading", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockStatsResponse),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByText(/actieve projecten/i)).toBeInTheDocument();
    expect(screen.getByText(/verlopen taken/i)).toBeInTheDocument();
    expect(screen.getByText(/maandelijkse omzet/i)).toBeInTheDocument();
    expect(screen.getByText(/openstaande facturen/i)).toBeInTheDocument();
    expect(screen.getByText(/personeelsbezetting/i)).toBeInTheDocument();
  });

  it("displays active project count from stats endpoint", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...mockStatsResponse, active_projects: 2 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("kpi-active-projects")).toHaveTextContent("2");
  });

  it("displays overdue task count from stats endpoint", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ ...mockStatsResponse, overdue_tasks: 2 }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("kpi-overdue-tasks")).toHaveTextContent("2");
  });

  it("shows zero monthly revenue when stats returns 0", async () => {
    vi.doMock("@/lib/projects", () => ({ formatBudget: fmtBudget }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue(mockStatsResponse),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    expect(screen.getByTestId("kpi-monthly-revenue")).toHaveTextContent("0");
  });
});

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({
        data: { user_id: "u1", in_app_enabled: true, email_enabled: true, push_enabled: false, type_overrides: null },
        error: null,
      }),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  it("renders Weergave section", async () => {
    const { ThemeProvider } = await import("@/lib/theme-provider");
    const { default: SettingsPage } = await import("@/app/dashboard/settings/page");

    render(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    );

    expect(screen.getByText(/weergave/i)).toBeInTheDocument();
  });

  it("renders Light, Dark, and System theme options", async () => {
    const { ThemeProvider } = await import("@/lib/theme-provider");
    const { default: SettingsPage } = await import("@/app/dashboard/settings/page");

    render(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    );

    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });
});
