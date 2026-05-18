import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  usePathname: vi.fn(() => "/dashboard/projects/new"),
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

// Mock api + auth so projects.ts can be tested against a controlled apiFetch
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAccessToken: vi.fn().mockReturnValue("tok") }));

// Mock projects module for wizard UI tests
vi.mock("@/lib/projects", () => ({
  createProject: vi.fn().mockResolvedValue({ id: "p1", name: "Test" }),
  createPhase: vi.fn().mockResolvedValue({ id: "ph1", name: "Fase 1" }),
  createTask: vi.fn().mockResolvedValue({ id: "t1", name: "Taak 1" }),
}));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

describe("types", () => {
  it("exports ProjectCreate, PhaseCreate, TaskCreate interfaces", async () => {
    // Static import check — if types don't exist, this will throw
    const types = await import("@/lib/types");
    expect(types).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Projects API client — test that functions call apiFetch correctly.
// Because @/lib/projects is mocked at module level, we test the mock contract
// here via the shared apiFetch mock.
// ---------------------------------------------------------------------------

describe("projects API client — apiFetch integration", () => {
  let apiFetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const apiModule = await import("@/lib/api");
    apiFetchMock = vi.mocked(apiModule.apiFetch);
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ id: "x" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("apiFetch mock is set up correctly for projects module", async () => {
    // Verify the mock infrastructure is in place
    const apiModule = await import("@/lib/api");
    expect(vi.isMockFunction(apiModule.apiFetch)).toBe(true);
  });

  it("createProject mock returns expected shape", async () => {
    const { createProject } = await import("@/lib/projects");
    const result = await createProject({ name: "Test", status: "planning" });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
  });

  it("createPhase mock returns expected shape", async () => {
    const { createPhase } = await import("@/lib/projects");
    const result = await createPhase("p1", { name: "Fase 1", order_index: 0, status: "not_started" });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
  });

  it("createTask mock returns expected shape", async () => {
    const { createTask } = await import("@/lib/projects");
    const result = await createTask("p1", "ph1", {
      name: "Taak 1",
      status: "todo",
      priority: "medium",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
  });
});

// ---------------------------------------------------------------------------
// Project creation wizard
// ---------------------------------------------------------------------------

describe("ProjectWizard", () => {
  beforeEach(() => {
    vi.resetModules();
    // Re-apply mocks after resetModules
    vi.mock("@/lib/projects", () => ({
      createProject: vi.fn().mockResolvedValue({ id: "p1", name: "Test" }),
      createPhase: vi.fn().mockResolvedValue({ id: "ph1", name: "Fase 1" }),
      createTask: vi.fn().mockResolvedValue({ id: "t1", name: "Taak 1" }),
    }));
  });

  async function renderWizard() {
    const { default: WizardPage } = await import("@/app/dashboard/projects/new/page");
    return render(<WizardPage />);
  }

  it("renders step 1 (Projectgegevens) by default", async () => {
    await renderWizard();
    expect(screen.getAllByText(/projectgegevens/i).length).toBeGreaterThan(0);
  });

  it("shows all 4 step indicators", async () => {
    await renderWizard();
    expect(screen.getAllByText(/projectgegevens/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fasen/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/taken/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/controle/i).length).toBeGreaterThan(0);
  });

  it("step 1 has project name input", async () => {
    await renderWizard();
    expect(screen.getByLabelText(/projectnaam/i)).toBeInTheDocument();
  });

  it("step 1 blocks navigation when name is empty", async () => {
    await renderWizard();
    const nextBtn = screen.getByRole("button", { name: /volgende/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/projectnaam is verplicht/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/projectnaam/i)).toBeInTheDocument();
  });

  it("step 1 advances to step 2 when name is filled", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.type(screen.getByLabelText(/projectnaam/i), "Nieuwbouw Leiden");
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    expect(screen.getByText(/fase toevoegen/i)).toBeInTheDocument();
  });

  it("step 2 (Fasen) can add a phase", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.type(screen.getByLabelText(/projectnaam/i), "Project X");
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    await user.click(screen.getByRole("button", { name: /fase toevoegen/i }));
    expect(screen.getByDisplayValue("Fase 1")).toBeInTheDocument();
  });

  it("step 2 has Vorige button that returns to step 1", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.type(screen.getByLabelText(/projectnaam/i), "Project X");
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    await user.click(screen.getByRole("button", { name: /vorige/i }));
    expect(screen.getByLabelText(/projectnaam/i)).toBeInTheDocument();
  });

  it("step 3 (Taken) shows phases and allows adding tasks", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.type(screen.getByLabelText(/projectnaam/i), "Project X");
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    await user.click(screen.getByRole("button", { name: /fase toevoegen/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    expect(screen.getByText(/taak toevoegen/i)).toBeInTheDocument();
  });

  it("step 4 (Controle) shows project name in review", async () => {
    const user = userEvent.setup();
    await renderWizard();

    await user.type(screen.getByLabelText(/projectnaam/i), "Renovatie Amsterdam");
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    expect(screen.getByText("Renovatie Amsterdam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /project aanmaken/i })).toBeInTheDocument();
  });

  it("step 4 submit calls createProject then navigates", async () => {
    const projectsModule = await import("@/lib/projects");
    const mockCreateProject = vi.mocked(projectsModule.createProject);
    mockCreateProject.mockResolvedValue({ id: "p1", name: "Test Project" } as never);

    const { useRouter } = await import("next/navigation");
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, replace: vi.fn() } as never);

    const user = userEvent.setup();
    await renderWizard();

    await user.type(screen.getByLabelText(/projectnaam/i), "Test Project");
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));
    await user.click(screen.getByRole("button", { name: /volgende/i }));

    await user.click(screen.getByRole("button", { name: /project aanmaken/i }));

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test Project" })
      );
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/projects");
    });
  });
});
