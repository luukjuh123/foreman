import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/projects/proj-1"),
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
  formatBudget: vi.fn((c: number) => `€\u00a0${(c / 100).toFixed(2).replace(".", ",")}`),
  formatDate: vi.fn((d: string | null) => d ?? ""),
}));

vi.mock("@/components/time-tracking/TimeTracker", () => ({
  default: () => <div data-testid="time-tracker" />,
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

const makeProject = (phases: ReturnType<typeof makePhase>[] = [makePhase()]) => ({
  id: "proj-1",
  owner_id: "user-1",
  name: "Nieuwbouw A",
  description: null,
  status: "active" as const,
  start_date: null,
  end_date: null,
  budget_cents: null,
  phases,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeSub = (overrides: Partial<{
  id: string;
  company_name: string;
  specialties: string[];
}> = {}) => ({
  id: overrides.id ?? "sub-1",
  owner_id: "user-1",
  company_name: overrides.company_name ?? "Loodgieters BV",
  kvk_number: "12345678",
  specialties: overrides.specialties ?? ["loodgieter"],
  hourly_rate_cents: 7500,
  fixed_rate_cents: null,
  certifications: [],
  rating: null,
  active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
});

const makeSubListResponse = (subs: ReturnType<typeof makeSub>[]) => ({
  data: subs,
  total: subs.length,
  page: 1,
  per_page: 100,
});

async function getGetProject() {
  const { getProject } = await import("@/lib/projects");
  return vi.mocked(getProject);
}

async function getApiFetch() {
  const { apiFetch } = await import("@/lib/api");
  return vi.mocked(apiFetch);
}

// Route apiFetch by URL so call ordering between sibling components
// (e.g. the punch-list tab fetching on mount) does not consume the
// mock reserved for the subcontractor list.
const EMPTY_LIST = { data: [], total: 0, page: 1, per_page: 20 };

function routeApiFetch(
  apiFetch: ReturnType<typeof vi.fn>,
  subListResponse: unknown
) {
  apiFetch.mockImplementation((path: string) => {
    if (path.startsWith("/subcontractors/?")) {
      return Promise.resolve(subListResponse);
    }
    return Promise.resolve(EMPTY_LIST);
  });
}

// ---------------------------------------------------------------------------
// Tests: subcontractor picker on phase card
// ---------------------------------------------------------------------------

describe("ProjectDetailPage — subcontractor assignment", () => {
  beforeEach(() => vi.resetModules());

  it("renders Onderaannemer toewijzen button on expanded phase card", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject([makePhase()]));
    apiFetch.mockResolvedValue(makeSubListResponse([makeSub()]));

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByText("Fundering"));
    fireEvent.click(screen.getByText("Fundering"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /onderaannemer toewijzen/i })
      ).toBeInTheDocument();
    });
  });

  it("opens subcontractor picker when button is clicked", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject([makePhase()]));
    // First call: subcontractor list; subsequent: assignment list
    apiFetch
      .mockResolvedValueOnce(makeSubListResponse([makeSub({ company_name: "Loodgieters BV" })]))
      .mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 });

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByText("Fundering"));
    fireEvent.click(screen.getByText("Fundering"));

    await waitFor(() =>
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /onderaannemer toewijzen/i })
      ).toBeInTheDocument();
    });
  });

  it("shows subcontractors in picker dialog", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject([makePhase()]));
    routeApiFetch(
      apiFetch,
      makeSubListResponse([
        makeSub({ id: "s1", company_name: "Loodgieters BV" }),
        makeSub({ id: "s2", company_name: "Schilder & Zn" }),
      ])
    );

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByText("Fundering"));
    fireEvent.click(screen.getByText("Fundering"));

    await waitFor(() =>
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );

    await waitFor(() => {
      expect(screen.getByText("Loodgieters BV")).toBeInTheDocument();
      expect(screen.getByText("Schilder & Zn")).toBeInTheDocument();
    });
  });

  it("closes picker dialog when Annuleren is clicked", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject([makePhase()]));
    apiFetch
      .mockResolvedValueOnce(makeSubListResponse([makeSub()]))
      .mockResolvedValue({ data: [], total: 0, page: 1, per_page: 20 });

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByText("Fundering"));
    fireEvent.click(screen.getByText("Fundering"));

    await waitFor(() =>
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );

    await waitFor(() =>
      screen.getByRole("heading", { name: /onderaannemer toewijzen/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /annuleren/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /onderaannemer toewijzen/i })
      ).not.toBeInTheDocument();
    });
  });

  it("shows rate input when a subcontractor is selected in picker", async () => {
    const getProject = await getGetProject();
    const apiFetch = await getApiFetch();
    getProject.mockResolvedValue(makeProject([makePhase()]));
    routeApiFetch(
      apiFetch,
      makeSubListResponse([makeSub({ id: "s1", company_name: "Loodgieters BV" })])
    );

    const { default: ProjectDetailPage } = await import(
      "@/app/dashboard/projects/[id]/page"
    );
    render(<ProjectDetailPage params={Promise.resolve({ id: "proj-1" })} />);

    await waitFor(() => screen.getByText("Fundering"));
    fireEvent.click(screen.getByText("Fundering"));

    await waitFor(() =>
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /onderaannemer toewijzen/i })
    );

    await waitFor(() => screen.getByText("Loodgieters BV"));

    // Select the subcontractor
    const option = screen.getByRole("option", { name: /loodgieters bv/i });
    fireEvent.change(option.closest("select")!, { target: { value: "s1" } });

    await waitFor(() => {
      expect(screen.getByLabelText(/tarief/i)).toBeInTheDocument();
    });
  });
});
