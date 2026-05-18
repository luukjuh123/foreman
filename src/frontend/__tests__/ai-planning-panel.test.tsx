import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

// Mock planning API
vi.mock("@/lib/planning", () => ({
  autofillPlanning: vi.fn(),
  applyPlanning: vi.fn(),
}));

import { autofillPlanning, applyPlanning } from "@/lib/planning";

const mockProject = {
  id: "project-1",
  name: "Testproject",
  description: null,
  status: "active" as const,
  start_date: "2026-01-05",
  end_date: null,
  budget_cents: null,
  phases: [
    {
      id: "phase-1",
      project_id: "project-1",
      name: "Fase 1",
      description: null,
      order_index: 0,
      status: "active",
      start_date: null,
      end_date: null,
      tasks: [
        {
          id: "task-1",
          phase_id: "phase-1",
          name: "Fundering leggen",
          status: "todo" as const,
          priority: 1,
          estimated_hours: 16,
        },
        {
          id: "task-2",
          phase_id: "phase-1",
          name: "Muren optrekken",
          status: "todo" as const,
          priority: 2,
          estimated_hours: 24,
        },
      ],
    },
  ],
};

const mockProposals = [
  {
    task_id: "task-1",
    proposed_start_date: "2026-01-05",
    proposed_end_date: "2026-01-06",
    reasoning: "Geen afhankelijkheden — start op projectstartdatum. Duur: 16u (2d).",
    is_critical: true,
  },
  {
    task_id: "task-2",
    proposed_start_date: "2026-01-07",
    proposed_end_date: "2026-01-09",
    reasoning: "Afhankelijk van taak 1. Duur: 24u (3d).",
    is_critical: false,
  },
];

describe("planning API client", () => {
  it("autofillPlanning is a function", async () => {
    const { autofillPlanning } = await import("@/lib/planning");
    expect(typeof autofillPlanning).toBe("function");
  });

  it("applyPlanning is a function", async () => {
    const { applyPlanning } = await import("@/lib/planning");
    expect(typeof applyPlanning).toBe("function");
  });
});

describe("AIPlanningPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function renderPanel() {
    const { default: AIPlanningPanel } = await import("@/components/planning/AIPlanningPanel");
    render(<AIPlanningPanel project={mockProject} />);
  }

  it("renders the generate button", async () => {
    await renderPanel();
    expect(screen.getByRole("button", { name: /AI-planning genereren/i })).toBeInTheDocument();
  });

  it("shows loading state when generating", async () => {
    vi.mocked(autofillPlanning).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    expect(screen.getByText(/bezig met genereren/i)).toBeInTheDocument();
  });

  it("displays proposals after successful generate", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      expect(screen.getByText("Fundering leggen")).toBeInTheDocument();
    });
    expect(screen.getByText("Muren optrekken")).toBeInTheDocument();
  });

  it("displays Dutch formatted dates in proposals", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      expect(screen.getByText(/05-01-2026/)).toBeInTheDocument();
    });
    expect(screen.getByText(/06-01-2026/)).toBeInTheDocument();
  });

  it("displays reasoning text for each proposal", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      expect(screen.getByText(/Geen afhankelijkheden/)).toBeInTheDocument();
    });
  });

  it("marks critical path tasks", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      expect(screen.getByText(/kritiek pad/i)).toBeInTheDocument();
    });
  });

  it("shows error message when generate fails", async () => {
    vi.mocked(autofillPlanning).mockRejectedValue(new Error("Netwerkfout"));
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      expect(screen.getByText(/Netwerkfout/)).toBeInTheDocument();
    });
  });

  it("shows checkboxes for each proposal", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(2);
    });
  });

  it("all proposals selected by default", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(checkboxes.every((cb) => cb.checked)).toBe(true);
    });
  });

  it("can deselect a proposal", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => screen.getAllByRole("checkbox"));
    const [firstCheckbox] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox.checked).toBe(false);
  });

  it("shows apply button after proposals loaded", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /geselecteerde toepassen/i })).toBeInTheDocument();
    });
  });

  it("calls applyPlanning with selected task_ids", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    vi.mocked(applyPlanning).mockResolvedValue({ updated_count: 2 });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    fireEvent.click(screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    await waitFor(() => {
      expect(applyPlanning).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: "project-1",
          task_ids: ["task-1", "task-2"],
        })
      );
    });
  });

  it("shows success message after apply", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    vi.mocked(applyPlanning).mockResolvedValue({ updated_count: 2 });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    fireEvent.click(screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    await waitFor(() => {
      expect(screen.getByText(/2 taken bijgewerkt/i)).toBeInTheDocument();
    });
  });

  it("shows loading state when applying", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    vi.mocked(applyPlanning).mockImplementation(() => new Promise(() => {}));
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    fireEvent.click(screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    await waitFor(() => {
      expect(screen.getByText(/toepassen/i)).toBeInTheDocument();
    });
  });

  it("shows error when apply fails", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    vi.mocked(applyPlanning).mockRejectedValue(new Error("Serverfout"));
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    fireEvent.click(screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    await waitFor(() => {
      expect(screen.getByText(/Serverfout/)).toBeInTheDocument();
    });
  });

  it("apply only sends selected task_ids", async () => {
    vi.mocked(autofillPlanning).mockResolvedValue({ proposals: mockProposals });
    vi.mocked(applyPlanning).mockResolvedValue({ updated_count: 1 });
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /AI-planning genereren/i }));
    await waitFor(() => screen.getAllByRole("checkbox"));
    // Deselect first
    const [firstCheckbox] = screen.getAllByRole("checkbox");
    fireEvent.click(firstCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /geselecteerde toepassen/i }));
    await waitFor(() => {
      expect(applyPlanning).toHaveBeenCalledWith(
        expect.objectContaining({
          task_ids: ["task-2"],
        })
      );
    });
  });
});
