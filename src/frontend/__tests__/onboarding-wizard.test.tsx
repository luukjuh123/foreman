import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock window.matchMedia
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

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/onboarding"),
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock auth context
vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "u1", name: "Test", email: "t@t.nl", role: "admin" },
    loading: false,
  })),
}));

// Mock api + auth
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAccessToken: vi.fn().mockReturnValue("tok") }));

// Mock projects module
vi.mock("@/lib/projects", () => ({
  createProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Badkamer renovatie" }),
  createPhase: vi.fn().mockResolvedValue({ id: "phase-1", name: "Sloop" }),
  createTask: vi.fn().mockResolvedValue({ id: "task-1", name: "Taak 1" }),
}));

// ---------------------------------------------------------------------------
// OnboardingWizard component
// ---------------------------------------------------------------------------

describe("OnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.mock("next/navigation", () => ({
      useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
      usePathname: vi.fn(() => "/dashboard/onboarding"),
      redirect: vi.fn(),
    }));
    vi.mock("@/lib/projects", () => ({
      createProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Badkamer renovatie" }),
      createPhase: vi.fn().mockResolvedValue({ id: "phase-1", name: "Sloop" }),
      createTask: vi.fn().mockResolvedValue({ id: "task-1", name: "Taak 1" }),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  async function renderWizard() {
    const { default: OnboardingWizard } = await import("@/components/onboarding-wizard");
    return render(<OnboardingWizard />);
  }

  // -------------------------------------------------------------------------
  // Step 1 — Welkom
  // -------------------------------------------------------------------------

  it("renders step 1 welcome message", async () => {
    await renderWizard();
    expect(screen.getByText(/welkom bij foreman/i)).toBeInTheDocument();
  });

  it("step 1 shows Begin button", async () => {
    await renderWizard();
    expect(screen.getByRole("button", { name: /begin/i })).toBeInTheDocument();
  });

  it("step 1 explains key features", async () => {
    await renderWizard();
    // Should mention key features — use getAllByText since stepper also shows "Project"
    expect(screen.getAllByText(/project/i).length).toBeGreaterThan(0);
  });

  it("step 1 has stepper with 4 steps", async () => {
    await renderWizard();
    // All 4 step indicators should be visible
    const stepNumbers = screen.getAllByText(/^[1234]$/);
    expect(stepNumbers.length).toBeGreaterThanOrEqual(4);
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it("clicking Begin advances to step 2", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));

    expect(screen.getByText(/uw eerste project/i)).toBeInTheDocument();
  });

  it("step 2 has Vorige button that returns to step 1", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));
    await user.click(screen.getByRole("button", { name: /vorige/i }));

    expect(screen.getByText(/welkom bij foreman/i)).toBeInTheDocument();
  });

  it("step 2 Volgende advances to step 3", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    expect(screen.getByText(/fasen & taken/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Step 2 — Uw eerste project
  // -------------------------------------------------------------------------

  it("step 2 pre-fills sample project name 'Badkamer renovatie'", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));

    const nameInput = screen.getByDisplayValue(/badkamer renovatie/i);
    expect(nameInput).toBeInTheDocument();
  });

  it("step 2 pre-fills sample project description", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));

    // Description field should be pre-filled with non-empty content
    const descriptionField = screen.getByRole("textbox", { name: /beschrijving/i });
    const value = (descriptionField as HTMLTextAreaElement).value;
    expect(value.length).toBeGreaterThan(0);
  });

  it("step 2 allows editing the project name", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));

    const nameInput = screen.getByDisplayValue(/badkamer renovatie/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Nieuw project");

    expect(nameInput).toHaveValue("Nieuw project");
  });

  // -------------------------------------------------------------------------
  // Step 3 — Fasen & taken
  // -------------------------------------------------------------------------

  it("step 3 shows phase list with sample phases", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    // Should show some phases
    expect(screen.getByText(/sloop/i)).toBeInTheDocument();
  });

  it("step 3 shows progress indicator", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    // Should show the phases list — stepper also has "Fasen" so use getAllByText
    expect(screen.getAllByText(/fasen/i).length).toBeGreaterThan(0);
    // Phase list should be present
    expect(screen.getByTestId("phases-list")).toBeInTheDocument();
  });

  it("step 3 Volgende calls createProject and createPhase then advances to step 4", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.click(screen.getByRole("button", { name: /begin/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    const voltooienBtn = screen.getByRole("button", { name: /voltooien/i });
    await user.click(voltooienBtn);

    const { createProject } = await import("@/lib/projects");
    await waitFor(() => {
      expect(vi.mocked(createProject)).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /klaar/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Step 4 — Klaar!
  // -------------------------------------------------------------------------

  async function navigateToStep4(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /begin/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    const voltooienBtn = screen.getByRole("button", { name: /voltooien/i });
    await user.click(voltooienBtn);
    // Wait for step 4 heading to appear (distinct from stepper label)
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /klaar/i })).toBeInTheDocument();
    });
  }

  it("step 4 shows completion success message", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await navigateToStep4(user);

    expect(screen.getByRole("heading", { name: /klaar/i })).toBeInTheDocument();
  });

  it("step 4 shows 'Naar mijn project' link", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await navigateToStep4(user);

    const projectLink = screen.getByRole("link", { name: /naar mijn project/i });
    expect(projectLink).toBeInTheDocument();
    expect(projectLink).toHaveAttribute("href", expect.stringContaining("/dashboard/projects/proj-1"));
  });

  it("step 4 shows 'Naar het dashboard' link", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await navigateToStep4(user);

    const dashboardLink = screen.getByRole("link", { name: /naar het dashboard/i });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  it("step 4 shows 'Ontdek meer functies' section", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await navigateToStep4(user);

    expect(screen.getByText(/ontdek meer functies/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // localStorage completion flag
  // -------------------------------------------------------------------------

  it("sets foreman_onboarding_done in localStorage on step 4", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await navigateToStep4(user);

    expect(localStorage.getItem("foreman_onboarding_done")).toBe("true");
  });

  // -------------------------------------------------------------------------
  // Skip button
  // -------------------------------------------------------------------------

  it("shows Overslaan button on steps 1-3", async () => {
    await renderWizard();
    expect(screen.getByRole("button", { name: /overslaan/i })).toBeInTheDocument();
  });

  it("Overslaan sets localStorage flag and redirects to dashboard", async () => {
    const user = userEvent.setup();
    await renderWizard();

    const { useRouter } = await import("next/navigation");
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, replace: vi.fn() } as never);

    // Re-render to pick up updated mock
    const { default: OnboardingWizard } = await import("@/components/onboarding-wizard");
    const { unmount } = render(<OnboardingWizard />);

    await user.click(screen.getAllByRole("button", { name: /overslaan/i })[1]);

    expect(localStorage.getItem("foreman_onboarding_done")).toBe("true");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");

    unmount();
  });
});

// ---------------------------------------------------------------------------
// Dashboard onboarding redirect
// ---------------------------------------------------------------------------

describe("DashboardPage onboarding redirect", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockReturnValue(new Promise(() => {})),
      formatBudget: (cents: number) =>
        new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100),
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockReturnValue(new Promise(() => {})),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("redirects to /dashboard/onboarding when onboarding not done", async () => {
    localStorage.removeItem("foreman_onboarding_done");

    const { useRouter } = await import("next/navigation");
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, replace: vi.fn() } as never);

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/onboarding");
    });
  });

  it("does NOT redirect to onboarding when flag is set", async () => {
    localStorage.setItem("foreman_onboarding_done", "true");

    const { useRouter } = await import("next/navigation");
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, replace: vi.fn() } as never);

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    // push should NOT have been called with onboarding path
    expect(mockPush).not.toHaveBeenCalledWith("/dashboard/onboarding");
  });
});
