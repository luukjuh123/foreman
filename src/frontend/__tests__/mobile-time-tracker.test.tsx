import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/time-tracking", () => ({
  listProjectProcesses: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  listTimeEntries: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockProcesses = {
  data: [
    {
      id: "pp-1",
      project_id: "proj-1",
      process_id: "proc-1",
      notes: null,
      created_at: "2024-01-01T00:00:00Z",
      process: {
        id: "proc-1",
        slug: "metselwerk",
        name: "Metselwerk",
        description: null,
        unit: "m2",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    },
  ],
};

describe("MobileTimeTracker", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders FAB button", async () => {
    const { listProjectProcesses } = await import("@/lib/time-tracking");
    (listProjectProcesses as ReturnType<typeof vi.fn>).mockResolvedValue(mockProcesses);

    const { default: MobileTimeTracker } = await import("@/components/mobile-time-tracker");
    await act(async () => {
      render(<MobileTimeTracker projectId="proj-1" />);
    });

    expect(screen.getByTestId("mobile-timer-fab")).toBeInTheDocument();
  });

  it("tapping FAB shows panel", async () => {
    const { listProjectProcesses } = await import("@/lib/time-tracking");
    (listProjectProcesses as ReturnType<typeof vi.fn>).mockResolvedValue(mockProcesses);

    const { default: MobileTimeTracker } = await import("@/components/mobile-time-tracker");
    await act(async () => {
      render(<MobileTimeTracker projectId="proj-1" />);
    });

    fireEvent.click(screen.getByTestId("mobile-timer-fab"));

    expect(screen.getByTestId("mobile-timer-panel")).toBeInTheDocument();
  });

  it("shows start button when no active timer", async () => {
    const { listProjectProcesses } = await import("@/lib/time-tracking");
    (listProjectProcesses as ReturnType<typeof vi.fn>).mockResolvedValue(mockProcesses);

    const { default: MobileTimeTracker } = await import("@/components/mobile-time-tracker");
    await act(async () => {
      render(<MobileTimeTracker projectId="proj-1" />);
    });

    fireEvent.click(screen.getByTestId("mobile-timer-fab"));

    await waitFor(() => {
      expect(screen.getByTestId("timer-start-btn")).toBeInTheDocument();
    });
  });

  it("renders project process selector", async () => {
    const { listProjectProcesses } = await import("@/lib/time-tracking");
    (listProjectProcesses as ReturnType<typeof vi.fn>).mockResolvedValue(mockProcesses);

    const { default: MobileTimeTracker } = await import("@/components/mobile-time-tracker");
    await act(async () => {
      render(<MobileTimeTracker projectId="proj-1" />);
    });

    fireEvent.click(screen.getByTestId("mobile-timer-fab"));

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });
});
