import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
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

// Mock projects module
vi.mock("@/lib/projects", () => ({
  createProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Voorbeeld Renovatie" }),
  createPhase: vi.fn().mockResolvedValue({ id: "phase-1", name: "Sloop" }),
  createTask: vi.fn().mockResolvedValue({ id: "task-1", name: "Taak" }),
  formatBudget: vi.fn((cents: number) => `€${cents / 100}`),
  listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

// ---------------------------------------------------------------------------
// OnboardingWizard component tests
// ---------------------------------------------------------------------------

describe("OnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function renderWizard() {
    const { default: OnboardingWizard } = await import(
      "@/components/onboarding/OnboardingWizard"
    );
    return render(<OnboardingWizard />);
  }

  // Step 1 rendering
  it("renders step 1 (Welkom) by default", async () => {
    await renderWizard();
    expect(screen.getByText(/welkom bij foreman/i)).toBeInTheDocument();
  });

  it("shows step indicator dots", async () => {
    await renderWizard();
    // 5 steps — look for the step dots container
    const dots = screen.getAllByRole("presentation");
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });

  it("renders a Volgende button on step 1", async () => {
    await renderWizard();
    expect(screen.getByRole("button", { name: /volgende/i })).toBeInTheDocument();
  });

  it("renders an Overslaan button on step 1", async () => {
    await renderWizard();
    expect(screen.getByRole("button", { name: /overslaan/i })).toBeInTheDocument();
  });

  // Navigation — Next
  it("advances to step 2 (Projecten) when Volgende is clicked", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    expect(screen.getByText(/projectbeheer/i)).toBeInTheDocument();
  });

  it("advances through all steps to step 5 (Voorbeeldproject)", async () => {
    const user = userEvent.setup();
    await renderWizard();
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    expect(screen.getAllByText(/voorbeeldproject/i).length).toBeGreaterThan(0);
  });

  // Navigation — Back
  it("shows Vorige button from step 2 onwards", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    expect(screen.getByRole("button", { name: /vorige/i })).toBeInTheDocument();
  });

  it("goes back to step 1 when Vorige is clicked on step 2", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    await user.click(screen.getByRole("button", { name: /vorige/i }));
    expect(screen.getByText(/welkom bij foreman/i)).toBeInTheDocument();
  });

  it("does not show Vorige button on step 1", async () => {
    await renderWizard();
    expect(screen.queryByRole("button", { name: /vorige/i })).not.toBeInTheDocument();
  });

  // Skip button sets localStorage flag
  it("sets localStorage flag when Overslaan is clicked", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await user.click(screen.getByRole("button", { name: /overslaan/i }));
    expect(localStorage.getItem("foreman_onboarding_complete")).toBe("true");
  });

  it("calls onClose callback when Overslaan is clicked", async () => {
    const { default: OnboardingWizard } = await import(
      "@/components/onboarding/OnboardingWizard"
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingWizard onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /overslaan/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Completion (last step "Afronden" / sets localStorage flag)
  it("sets localStorage flag when wizard is completed", async () => {
    const user = userEvent.setup();
    await renderWizard();
    // Navigate to step 5
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    // On last step, click finish/afronden
    const finishBtn = screen.getByRole("button", { name: /afronden/i });
    await user.click(finishBtn);
    expect(localStorage.getItem("foreman_onboarding_complete")).toBe("true");
  });

  // Sample project creation
  it("shows 'Maak voorbeeldproject' button on step 5", async () => {
    const user = userEvent.setup();
    await renderWizard();
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    expect(
      screen.getByRole("button", { name: /maak voorbeeldproject/i })
    ).toBeInTheDocument();
  });

  it("calls createProject with correct data when sample project button is clicked", async () => {
    const { createProject } = await import("@/lib/projects");
    const user = userEvent.setup();
    await renderWizard();
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    await user.click(screen.getByRole("button", { name: /maak voorbeeldproject/i }));
    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Voorbeeld Renovatie",
          status: "active",
          budget_cents: 5000000,
        })
      );
    });
  });

  it("calls createPhase three times for Sloop, Ruwbouw, Afwerking", async () => {
    const { createPhase } = await import("@/lib/projects");
    const user = userEvent.setup();
    await renderWizard();
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    await user.click(screen.getByRole("button", { name: /maak voorbeeldproject/i }));
    await waitFor(() => {
      expect(createPhase).toHaveBeenCalledTimes(3);
    });
    const calls = vi.mocked(createPhase).mock.calls;
    const phaseNames = calls.map((c) => (c[1] as { name: string }).name);
    expect(phaseNames).toContain("Sloop");
    expect(phaseNames).toContain("Ruwbouw");
    expect(phaseNames).toContain("Afwerking");
  });

  it("calls createTask for tasks under each phase", async () => {
    const { createTask } = await import("@/lib/projects");
    const user = userEvent.setup();
    await renderWizard();
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    await user.click(screen.getByRole("button", { name: /maak voorbeeldproject/i }));
    // 7 tasks total (2 + 2 + 3)
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledTimes(7);
    });
  });

  it("shows success message after sample project creation", async () => {
    const user = userEvent.setup();
    await renderWizard();
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: /volgende/i }));
    }
    await user.click(screen.getByRole("button", { name: /maak voorbeeldproject/i }));
    await waitFor(() => {
      expect(screen.getByText(/project aangemaakt/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Onboarding trigger logic in DashboardPage
// ---------------------------------------------------------------------------

describe("Dashboard onboarding trigger", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("shows OnboardingWizard when flag not set", async () => {
    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (cents: number) => `€${cents / 100}`,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    // The wizard dialog should be rendered
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show OnboardingWizard when flag is set", async () => {
    localStorage.setItem("foreman_onboarding_complete", "true");

    vi.doMock("@/lib/projects", () => ({
      listProjects: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 }),
      formatBudget: (cents: number) => `€${cents / 100}`,
    }));
    vi.doMock("@/lib/api", () => ({
      apiFetch: vi.fn().mockResolvedValue({ data: { data: [], total: 0 }, error: null }),
    }));

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await act(async () => {
      render(<DashboardPage />);
    });

    // Dashboard stats header renders, but the standalone onboarding modal should not
    // The wizard-specific step content (Projectbeheer, Voorbeeldproject) should not be visible
    expect(screen.queryByText(/projectbeheer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/voorbeeldproject/i)).not.toBeInTheDocument();
  });
});
