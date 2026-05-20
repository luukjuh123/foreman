import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/staff/payroll"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockStaff = [
  {
    id: "staff-1",
    full_name: "Jan de Vries",
    role: "Timmerman",
    hourly_rate_cents: 3500,
    weekly_hours_target: 40,
    active: true,
  },
  {
    id: "staff-2",
    full_name: "Piet Bakker",
    role: "Metselaar",
    hourly_rate_cents: 4000,
    weekly_hours_target: 40,
    active: true,
  },
];

const mockStaffListResponse = {
  data: mockStaff,
  total: 2,
  page: 1,
  per_page: 100,
};

const mockPayrollStaff1 = {
  staff_id: "staff-1",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  total_hours: 160.0,
  gross_cents: 560000,
  by_project: [
    { project_id: "proj-1", hours: 100.0, gross_cents: 350000 },
    { project_id: null, hours: 60.0, gross_cents: 210000 },
  ],
};

const mockPayrollStaff2 = {
  staff_id: "staff-2",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  total_hours: 80.0,
  gross_cents: 320000,
  by_project: [
    { project_id: "proj-1", hours: 80.0, gross_cents: 320000 },
  ],
};

const mockProjectsResponse = {
  data: [
    { id: "proj-1", name: "Bouwproject Alpha", status: "active", phases: [] },
  ],
  total: 1,
  page: 1,
  per_page: 100,
};

import { apiFetch } from "@/lib/api";

function setupApiFetch() {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/payroll/staff/")) {
      if (path.includes("staff-1")) return Promise.resolve(mockPayrollStaff1 as never);
      if (path.includes("staff-2")) return Promise.resolve(mockPayrollStaff2 as never);
    }
    if (typeof path === "string" && path.startsWith("/staff/")) {
      return Promise.resolve(mockStaffListResponse as never);
    }
    if (typeof path === "string" && path.startsWith("/projects/")) {
      return Promise.resolve(mockProjectsResponse as never);
    }
    return Promise.resolve(null as never);
  });
}

import PayrollPage from "@/app/dashboard/staff/payroll/page";

describe("PayrollOverviewPage — period selector and staff table", () => {
  beforeEach(() => {
    setupApiFetch();
  });

  it("renders Verloning heading", () => {
    render(<PayrollPage />);
    expect(screen.getByText("Verloning")).toBeInTheDocument();
  });

  it("renders period start and end date inputs", () => {
    render(<PayrollPage />);
    expect(screen.getByTestId("period-start")).toBeInTheDocument();
    expect(screen.getByTestId("period-end")).toBeInTheDocument();
  });

  it("renders table column headers in Dutch", async () => {
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByText("Medewerker")).toBeInTheDocument();
      expect(screen.getByText("Functie")).toBeInTheDocument();
      expect(screen.getByText("Uren")).toBeInTheDocument();
      expect(screen.getByText("Bruto loon")).toBeInTheDocument();
    });
  });

  it("renders staff names after load", async () => {
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
      expect(screen.getByText("Piet Bakker")).toBeInTheDocument();
    });
  });

  it("renders Uren registreren button", () => {
    render(<PayrollPage />);
    expect(
      screen.getByRole("button", { name: /uren registreren/i })
    ).toBeInTheDocument();
  });
});

describe("PayrollOverviewPage — payroll totals", () => {
  beforeEach(() => {
    setupApiFetch();
  });

  it("shows total hours per employee after load", async () => {
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByTestId("hours-staff-1")).toHaveTextContent("160,0");
      expect(screen.getByTestId("hours-staff-2")).toHaveTextContent("80,0");
    });
  });

  it("shows gross salary per employee in Dutch euro format", async () => {
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByTestId("gross-staff-1")).toHaveTextContent("5.600");
      expect(screen.getByTestId("gross-staff-2")).toHaveTextContent("3.200");
    });
  });

  it("shows summary row with total hours and total gross", async () => {
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByTestId("total-hours")).toHaveTextContent("240,0");
      expect(screen.getByTestId("total-gross")).toHaveTextContent("8.800");
    });
  });
});

describe("PayrollOverviewPage — expand row shows project breakdown", () => {
  beforeEach(() => {
    setupApiFetch();
  });

  it("clicking a row expands to show project breakdown", async () => {
    render(<PayrollPage />);
    await waitFor(() => screen.getByText("Jan de Vries"));

    fireEvent.click(screen.getByTestId("row-staff-1"));

    await waitFor(() => {
      expect(screen.getByTestId("breakdown-staff-1")).toBeInTheDocument();
    });
  });

  it("clicking expanded row collapses it", async () => {
    render(<PayrollPage />);
    await waitFor(() => screen.getByText("Jan de Vries"));

    fireEvent.click(screen.getByTestId("row-staff-1"));
    await waitFor(() => screen.getByTestId("breakdown-staff-1"));

    fireEvent.click(screen.getByTestId("row-staff-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("breakdown-staff-1")).not.toBeInTheDocument();
    });
  });
});

describe("PayrollOverviewPage — log hours modal", () => {
  beforeEach(() => {
    setupApiFetch();
  });

  it("opens Uren registreren modal when button clicked", async () => {
    render(<PayrollPage />);
    await waitFor(() => screen.getByText("Jan de Vries"));

    fireEvent.click(screen.getByRole("button", { name: /uren registreren/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("modal contains medewerker select, datum, uren fields", async () => {
    render(<PayrollPage />);
    await waitFor(() => screen.getByText("Jan de Vries"));

    fireEvent.click(screen.getByRole("button", { name: /uren registreren/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/medewerker/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/datum/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/uren/i)).toBeInTheDocument();
    });
  });
});
