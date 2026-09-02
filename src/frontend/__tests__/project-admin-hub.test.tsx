import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks — all at top level (vi.mock is hoisted)
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/proj-1"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/projects", () => ({
  getProject: vi.fn(),
  calcPhaseProgress: vi.fn(() => 50),
  calcTaskSummary: vi.fn(() => ({ done: 2, total: 4 })),
  formatBudget: vi.fn((c: number) => `€\u00a0${(c / 100).toFixed(2).replace(".", ",")}`),
  formatDate: vi.fn((d: string | null) => d ?? ""),
}));

vi.mock("@/components/time-tracking/TimeTracker", () => ({
  default: ({ projectId }: { projectId: string }) => (
    <div data-testid="time-tracker" data-project-id={projectId} />
  ),
}));

vi.mock("@/components/punch-list/PunchListTab", () => ({
  default: ({ projectId }: { projectId: string }) => (
    <div data-testid="punch-list-tab" data-project-id={projectId} />
  ),
}));

// Documents lib mock — listDocuments controlled per test via mockResolvedValue
vi.mock("@/lib/documents", () => ({
  listDocuments: vi.fn(async () => ({ data: [], total: 0 })),
  uploadDocument: vi.fn(),
  getDocumentDownloadUrl: vi.fn(async () => "https://example.com/download"),
  formatFileSize: vi.fn((b: number) => `${Math.round(b / 1024)} KB`),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePhase = (overrides: Partial<{
  id: string;
  name: string;
  tasks: unknown[];
}> = {}) => ({
  id: overrides.id ?? "phase-1",
  project_id: "proj-1",
  name: overrides.name ?? "Fundering",
  description: null,
  order_index: 0,
  status: "active",
  start_date: null,
  end_date: null,
  tasks: overrides.tasks ?? [],
});

const makeProject = (overrides: Partial<{
  id: string;
  name: string;
  status: string;
  budget_cents: number | null;
  phases: ReturnType<typeof makePhase>[];
}> = {}) => ({
  id: overrides.id ?? "proj-1",
  owner_id: "user-1",
  name: overrides.name ?? "Nieuwbouw A",
  description: null,
  status: (overrides.status ?? "active") as "active" | "draft" | "completed" | "archived",
  start_date: null,
  end_date: null,
  budget_cents: overrides.budget_cents ?? null,
  phases: overrides.phases ?? [makePhase()],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const EMPTY_LIST = { data: [], total: 0, page: 1, per_page: 20 };

async function getGetProject() {
  const { getProject } = await import("@/lib/projects");
  return vi.mocked(getProject);
}

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

async function getListDocuments() {
  const { listDocuments } = await import("@/lib/documents");
  return vi.mocked(listDocuments);
}

// ---------------------------------------------------------------------------
// Tests: ProjectHeader rendering
// ---------------------------------------------------------------------------

describe("ProjectDetailPage — header", () => {
  beforeEach(() => vi.resetModules());

  it("renders project name in header", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject({ name: "Renovatie Centrum" }));
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("project-name")).toHaveTextContent("Renovatie Centrum");
    });
  });

  it("renders status badge with Dutch label", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject({ status: "active" }));
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("project-status-badge")).toHaveTextContent("Actief");
    });
  });

  it("renders overall progress bar when tasks exist", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    // calcTaskSummary mocked to return { done: 2, total: 4 }
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("overall-progress-bar")).toBeInTheDocument();
    });
  });

  it("renders back button linking to /dashboard/projects", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      const backLink = screen.getByRole("link", { name: /terug naar projecten/i });
      expect(backLink).toHaveAttribute("href", "/dashboard/projects");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Tab rendering
// ---------------------------------------------------------------------------

describe("ProjectDetailPage — tab navigation", () => {
  beforeEach(() => vi.resetModules());

  it("renders all five tab buttons", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByTestId("tab-overzicht"));

    expect(screen.getByTestId("tab-overzicht")).toBeInTheDocument();
    expect(screen.getByTestId("tab-planning")).toBeInTheDocument();
    expect(screen.getByTestId("tab-financien")).toBeInTheDocument();
    expect(screen.getByTestId("tab-documenten")).toBeInTheDocument();
    expect(screen.getByTestId("tab-team")).toBeInTheDocument();
  });

  it("marks Overzicht tab as selected by default", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByTestId("tab-overzicht"));
    expect(screen.getByTestId("tab-overzicht")).toHaveAttribute("aria-selected", "true");
  });

  it("shows Overzicht tab content by default (punch list present)", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("punch-list-tab")).toBeInTheDocument();
    });
  });

  it("switches to Planning tab — calls router.push with tab=planning", async () => {
    const pushMock = vi.fn();
    const { useRouter } = await import("next/navigation");
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as ReturnType<typeof useRouter>);

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByTestId("tab-planning"));
    fireEvent.click(screen.getByTestId("tab-planning"));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("tab=planning")
    );
  });

  it("switches to Financiën tab — calls router.push with tab=financien", async () => {
    const pushMock = vi.fn();
    const { useRouter } = await import("next/navigation");
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as ReturnType<typeof useRouter>);

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByTestId("tab-financien"));
    fireEvent.click(screen.getByTestId("tab-financien"));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("tab=financien")
    );
  });

  it("switches to Documenten tab — calls router.push with tab=documenten", async () => {
    const pushMock = vi.fn();
    const { useRouter } = await import("next/navigation");
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as ReturnType<typeof useRouter>);

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByTestId("tab-documenten"));
    fireEvent.click(screen.getByTestId("tab-documenten"));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("tab=documenten")
    );
  });

  it("switches to Team tab — calls router.push with tab=team", async () => {
    const pushMock = vi.fn();
    const { useRouter } = await import("next/navigation");
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as ReturnType<typeof useRouter>);

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByTestId("tab-team"));
    fireEvent.click(screen.getByTestId("tab-team"));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("tab=team")
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: Financiën tab content (via ?tab=financien)
// ---------------------------------------------------------------------------

describe("ProjectDetailPage — Financiën tab content", () => {
  beforeEach(() => vi.resetModules());

  it("renders invoice list when invoices are returned for project", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=financien") as ReturnType<typeof useSearchParams>
    );

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject({ budget_cents: 500000 }));
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/invoices")) {
        return Promise.resolve({
          data: [
            {
              id: "inv-1",
              customer_id: "cust-1",
              project_id: "proj-1",
              invoice_number: "F-2024-001",
              issue_date: "2024-01-15",
              due_date: "2024-02-15",
              payment_terms_days: 30,
              currency: "EUR",
              status: "sent",
              notes: null,
              subtotal_cents: 100000,
              vat_total_cents: 21000,
              total_cents: 121000,
              sent_at: null,
              paid_at: null,
              lines: [],
            },
          ],
          total: 1,
          page: 1,
          per_page: 50,
        });
      }
      return Promise.resolve(EMPTY_LIST);
    });

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-list")).toBeInTheDocument();
      expect(screen.getByText("F-2024-001")).toBeInTheDocument();
    });
  });

  it("shows 'Geen facturen' message when no invoices returned", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=financien") as ReturnType<typeof useSearchParams>
    );

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue({ data: [], total: 0, page: 1, per_page: 50 });

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/geen facturen voor dit project/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Documenten tab content (via ?tab=documenten)
// ---------------------------------------------------------------------------

describe("ProjectDetailPage — Documenten tab content", () => {
  beforeEach(() => vi.resetModules());

  it("renders upload button on documenten tab", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=documenten") as ReturnType<typeof useSearchParams>
    );

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("upload-button")).toBeInTheDocument();
    });
  });

  it("renders document list when listDocuments returns data", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=documenten") as ReturnType<typeof useSearchParams>
    );

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const listDocuments = await getListDocuments();
    listDocuments.mockResolvedValue({
      data: [
        {
          id: "doc-1",
          project_id: "proj-1",
          filename: "contract_v1.pdf",
          original_filename: "Contract.pdf",
          category: "contract",
          description: null,
          file_size_bytes: 204800,
          mime_type: "application/pdf",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
      total: 1,
    });

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByTestId("document-list")).toBeInTheDocument();
      expect(screen.getByText("Contract.pdf")).toBeInTheDocument();
    });
  });

  it("shows 'Geen documenten' message when no documents", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=documenten") as ReturnType<typeof useSearchParams>
    );

    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject());
    apiFetch.mockResolvedValue(EMPTY_LIST);

    const listDocuments = await getListDocuments();
    listDocuments.mockResolvedValue({ data: [], total: 0 });

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText(/geen documenten geüpload/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: error and loading states
// ---------------------------------------------------------------------------

describe("ProjectDetailPage — error/loading states", () => {
  beforeEach(() => vi.resetModules());

  it("shows loading state initially", async () => {
    const getProject = await getGetProject();
    getProject.mockReturnValue(new Promise(() => {})); // never resolve

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    expect(screen.getByText("Laden…")).toBeInTheDocument();
  });

  it("shows error state when project fetch fails", async () => {
    const getProject = await getGetProject();
    getProject.mockRejectedValue(new Error("Project niet gevonden."));

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Project niet gevonden.")).toBeInTheDocument();
    });
  });
});
